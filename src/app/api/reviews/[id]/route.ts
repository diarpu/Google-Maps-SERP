import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(req.url);
        const requestedRunId = url.searchParams.get('runId');

        const analysis = await prisma.reviewAnalysis.findUnique({
            where: { id },
        });

        if (!analysis) {
            return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
        }

        // Get currentRunId via raw SQL (Prisma client doesn't know this field)
        const currentRunIdResult: any[] = await prisma.$queryRawUnsafe(
            `SELECT currentRunId FROM ReviewAnalysis WHERE id = ?`,
            id
        );
        const currentRunId = currentRunIdResult[0]?.currentRunId || null;

        // Get all distinct runs for history timeline via raw SQL
        const rawRuns: any[] = await prisma.$queryRawUnsafe(
            `SELECT runId, MIN(runAt) as runAt, COUNT(*) as reviewCount 
             FROM Review 
             WHERE analysisId = ? 
             GROUP BY runId 
             ORDER BY MIN(runAt) ASC`,
            id
        );

        const runs = rawRuns.map((r: any, idx: number) => ({
            runId: r.runId || `${id}-legacy`,
            runAt: r.runAt ? new Date(r.runAt).toISOString() : analysis.createdAt.toISOString(),
            reviewCount: Number(r.reviewCount),
            label: `Run ${idx + 1}`,
        }));

        // Determine which run to show
        const activeRunId = requestedRunId || currentRunId || (runs.length > 0 ? runs[runs.length - 1].runId : null);

        // Fetch reviews for the active run via raw SQL (runId filter uses new field)
        let reviews: any[];
        if (activeRunId && runs.some(r => r.runId === activeRunId)) {
            const matchingRun = rawRuns.find(r => (r.runId || `${id}-legacy`) === activeRunId);
            if (matchingRun && matchingRun.runId) {
                reviews = await prisma.$queryRawUnsafe(
                    `SELECT * FROM Review WHERE analysisId = ? AND runId = ? ORDER BY rating ASC`,
                    id, matchingRun.runId
                );
            } else {
                // Legacy reviews (runId IS NULL)
                reviews = await prisma.$queryRawUnsafe(
                    `SELECT * FROM Review WHERE analysisId = ? AND runId IS NULL ORDER BY rating ASC`,
                    id
                );
            }
        } else {
            // No run filter, get all reviews
            reviews = await prisma.$queryRawUnsafe(
                `SELECT * FROM Review WHERE analysisId = ? ORDER BY rating ASC`,
                id
            );
        }

        // Convert SQLite booleans and BigInts for JSON serialization
        reviews = reviews.map((r: any) => ({
            ...r,
            isLikelyFake: Boolean(r.isLikelyFake),
            reviewCount: r.reviewCount != null ? Number(r.reviewCount) : null,
            photoCount: r.photoCount != null ? Number(r.photoCount) : null,
            rating: Number(r.rating),
            sentimentScore: r.sentimentScore != null ? Number(r.sentimentScore) : null,
            fakeScore: r.fakeScore != null ? Number(r.fakeScore) : null,
        }));

        return NextResponse.json({
            ...analysis,
            createdAt: analysis.createdAt.toISOString(),
            reviews,
            runs,
            activeRunId,
        });
    } catch (error: any) {
        console.error('GET /api/reviews/[id] error:', error);
        return NextResponse.json({ error: 'Failed to fetch analysis', details: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.reviewAnalysis.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to delete analysis', details: error.message }, { status: 500 });
    }
}
