import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scrapeGoogleReviews } from '@/lib/reviewScraper';
import { analyzeReviews } from '@/lib/reviewAnalyzer';
import { analyzeSentiment } from '@/lib/sentimentEngine';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const encoder = new TextEncoder();
    const customReadable = new TransformStream();
    const writer = customReadable.writable.getWriter();

    const sendLog = async (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
        try {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ msg, type })}\n\n`));
        } catch { /* connection closed */ }
    };

    const sendResult = async (data: any) => {
        try {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ result: data, type: 'complete' })}\n\n`));
            await writer.close();
        } catch { /* connection closed */ }
    };

    (async () => {
        try {
            const { id } = await params;

            // Fetch existing analysis
            const analysis = await prisma.reviewAnalysis.findUnique({
                where: { id },
            });

            if (!analysis) {
                await sendLog('Analysis not found', 'error');
                await writer.close();
                return;
            }

            if (analysis.status === 'SCRAPING' || analysis.status === 'ANALYZING') {
                await sendLog('Analysis is already running', 'error');
                await writer.close();
                return;
            }

            // Count existing runs via raw SQL (Prisma client doesn't know new fields)
            const existingRuns: any[] = await prisma.$queryRawUnsafe(
                `SELECT DISTINCT runId FROM Review WHERE analysisId = ?`,
                id
            );
            const runNumber = existingRuns.length;
            const newRunId = `${id}-run${runNumber}`;
            const runAt = new Date().toISOString();

            await sendLog(`Starting rerun #${runNumber + 1} for "${analysis.businessName}"...`);

            // Update analysis status + currentRunId via raw SQL
            await prisma.$executeRawUnsafe(
                `UPDATE ReviewAnalysis SET status = 'SCRAPING', currentRunId = ?, error = NULL WHERE id = ?`,
                newRunId, id
            );

            // Scrape fresh reviews
            await sendLog(`Scraping reviews from ${analysis.businessUrl}...`);
            const onProgress = (msg: string) => sendLog(msg);
            const { business, reviews } = await scrapeGoogleReviews(analysis.businessUrl, onProgress);

            await sendLog(`Scraped ${reviews.length} reviews. Saving to database...`);

            // Update business info via standard Prisma (these fields are known)
            await prisma.reviewAnalysis.update({
                where: { id },
                data: {
                    businessName: business.name,
                    totalReviews: business.totalReviews,
                    averageRating: business.averageRating,
                    placeId: business.placeId,
                    status: 'ANALYZING',
                },
            });

            // Save reviews with new runId via raw SQL INSERT
            const chunkSize = 50;
            for (let i = 0; i < reviews.length; i += chunkSize) {
                const chunk = reviews.slice(i, i + chunkSize);
                for (const r of chunk) {
                    await prisma.$executeRawUnsafe(
                        `INSERT INTO Review (id, analysisId, runId, runAt, reviewerName, reviewerUrl, reviewImage, reviewCount, photoCount, rating, text, publishedDate, responseText, responseDate, sentimentScore, sentimentLabel, isLikelyFake, fakeScore)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`,
                        `${id}-${newRunId}-${i + chunk.indexOf(r)}`,
                        id, newRunId, runAt,
                        r.reviewerName || '', r.reviewerUrl || null, r.reviewImage || null,
                        r.reviewCount ?? null, r.photoCount ?? null, r.rating,
                        r.text || null, r.publishedDate || null,
                        r.responseText || null, r.responseDate || null
                    );
                }
                await sendLog(`Saved ${Math.min(i + chunkSize, reviews.length)} / ${reviews.length} reviews...`);
            }

            // Re-analyze
            await sendLog('Running 150+ metric deep analysis...');
            const analysisResult = analyzeReviews(reviews);

            // Sentiment enrichment — fetch new run's reviews via raw SQL
            await sendLog('Analyzing sentiment and fake patterns...');
            const dbReviews: any[] = await prisma.$queryRawUnsafe(
                `SELECT id, text, rating, reviewCount, photoCount FROM Review WHERE analysisId = ? AND runId = ?`,
                id, newRunId
            );

            const SENTIMENT_BATCH_SIZE = 50;
            for (let i = 0; i < dbReviews.length; i += SENTIMENT_BATCH_SIZE) {
                const batch = dbReviews.slice(i, i + SENTIMENT_BATCH_SIZE);
                for (const r of batch) {
                    const sent = analyzeSentiment(r.text, r.rating);

                    let fakeScore = 0;
                    if (!r.text || r.text.length < 20) fakeScore += 15;
                    if (r.reviewCount !== undefined && r.reviewCount <= 1) fakeScore += 20;
                    if (!r.photoCount) fakeScore += 5;
                    if ((r.rating === 1 || r.rating === 5) && (!r.text || r.text.length < 30)) fakeScore += 10;
                    if (r.text && r.rating === 5 && sent.label === 'NEGATIVE') fakeScore += 15;
                    if (r.text && r.rating === 1 && sent.label === 'POSITIVE') fakeScore += 15;

                    await prisma.$executeRawUnsafe(
                        `UPDATE Review SET sentimentScore = ?, sentimentLabel = ?, fakeScore = ?, isLikelyFake = ? WHERE id = ?`,
                        sent.compound, sent.label, Math.min(fakeScore, 100), fakeScore >= 50 ? 1 : 0, r.id
                    );
                }

                if (i % 200 === 0) await sendLog(`Analyzed ${Math.min(i + SENTIMENT_BATCH_SIZE, dbReviews.length)} / ${dbReviews.length} reviews...`);
            }

            await prisma.reviewAnalysis.update({
                where: { id },
                data: {
                    analysisData: JSON.stringify(analysisResult),
                    status: 'COMPLETED',
                },
            });

            await sendLog(`Rerun complete! ${reviews.length} reviews analyzed.`, 'success');
            await sendResult({ id: analysis.id });

        } catch (error: any) {
            console.error('Rerun error:', error);
            await sendLog(`Error: ${error.message}`, 'error');

            try {
                const { id } = await params;
                await prisma.reviewAnalysis.update({
                    where: { id },
                    data: { status: 'FAILED', error: error.message },
                });
            } catch { /* ignore */ }

            await writer.close();
        }
    })();

    return new NextResponse(customReadable.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
