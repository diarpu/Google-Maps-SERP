import ExcelJS from 'exceljs';

/**
 * Review Intelligence Export Utilities
 * - Multi-tab XLSX with styled sheets
 * - Structured JSON export
 * - Visual infographic HTML (toon file)
 */

// ============================================================
// XLSX EXPORT — Multi-tab workbook
// ============================================================
export async function exportReviewsToXLSX(data: any) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GeoRanker Review Intelligence';
    workbook.created = new Date();

    const analysis = JSON.parse(data.analysisData || '{}');
    const reviews = data.reviews || [];
    const { overview, sentiment, ratings, responses, legitimacy, content, temporal, actions, competitive } = analysis;

    // ─── Sheet 1: Executive Summary ───
    const summarySheet = workbook.addWorksheet('Executive Summary');
    summarySheet.columns = [
        { header: '', key: 'metric', width: 35 },
        { header: '', key: 'value', width: 30 },
    ];

    // Title row
    summarySheet.mergeCells('A1:B1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = `📊 ${data.businessName} — Review Intelligence Report`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF7C3AED' } };
    titleCell.alignment = { horizontal: 'center' };

    summarySheet.mergeCells('A2:B2');
    summarySheet.getCell('A2').value = `Generated: ${new Date().toLocaleDateString()} | ${data.totalReviews} reviews | ⭐ ${data.averageRating?.toFixed(1)} average`;
    summarySheet.getCell('A2').font = { size: 10, color: { argb: 'FF6B7280' } };
    summarySheet.getCell('A2').alignment = { horizontal: 'center' };

    let row = 4;
    const addMetric = (label: string, value: any) => {
        const r = summarySheet.getRow(row);
        r.getCell(1).value = label;
        r.getCell(1).font = { bold: true };
        r.getCell(2).value = String(value ?? 'N/A');
        row++;
    };

    const addSectionHeader = (title: string) => {
        row++;
        summarySheet.mergeCells(`A${row}:B${row}`);
        const cell = summarySheet.getCell(`A${row}`);
        cell.value = title;
        cell.font = { bold: true, size: 12, color: { argb: 'FF7C3AED' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
        row++;
    };

    if (overview) {
        addSectionHeader('🏆 Overview');
        addMetric('Health Score', `${overview.healthScore}/100`);
        addMetric('Grade', overview.gradeLabel);
        addMetric('Net Promoter Score', overview.netPromoterScore ?? 'N/A');
        addMetric('Customer Satisfaction Index', `${overview.customerSatisfactionIndex ?? 0}%`);
        addMetric('Response Rate', `${overview.responseRate}%`);
        addMetric('Fake Review %', `${overview.fakeReviewPercentage}%`);
        addMetric('Review Authenticity Score', `${overview.reviewAuthenticityScore ?? 0}%`);
        addMetric('Engagement Score', `${overview.engagementScore ?? 0}%`);
        addMetric('Reputation Momentum', overview.reputationMomentum || 'STABLE');
        addMetric('Overall Sentiment', overview.sentimentScore > 0 ? `+${overview.sentimentScore}` : overview.sentimentScore);
    }

    if (ratings) {
        addSectionHeader('⭐ Rating Metrics');
        addMetric('Average Rating', data.averageRating?.toFixed(2));
        addMetric('5-Star Ratio', `${ratings.fiveStarRatio}%`);
        addMetric('1-Star Ratio', `${ratings.oneStarRatio}%`);
        addMetric('Trend', ratings.improvingOrDeclining);
        addMetric('Rating Velocity', `${ratings.ratingVelocity}/month`);
        ratings.distribution?.forEach((d: any) => {
            addMetric(`${d.rating}★ Count`, `${d.count} (${d.percentage}%)`);
        });
    }

    if (sentiment) {
        addSectionHeader('💬 Sentiment Analysis');
        addMetric('Overall Label', sentiment.overallLabel);
        addMetric('Positive Reviews', sentiment.positiveCount);
        addMetric('Negative Reviews', sentiment.negativeCount);
        addMetric('Neutral Reviews', sentiment.neutralCount);
        addMetric('Rating-Text Alignment', `${sentiment.ratingTextAlignment}%`);
        addMetric('Sarcasm Suspects', sentiment.sarcasmSuspectCount ?? 0);
    }

    if (responses) {
        addSectionHeader('📝 Response Quality');
        addMetric('Response Rate', `${responses.responseRate}%`);
        addMetric('Negative Response Rate', `${responses.responseRateNegative}%`);
        addMetric('Empathy Score', `${responses.empathyScore}/100`);
        addMetric('Template Detection Rate', `${responses.templateDetectionRate}%`);
    }

    if (legitimacy) {
        addSectionHeader('🛡️ Legitimacy');
        addMetric('Trust Score', `${legitimacy.overallTrustScore}/100`);
        addMetric('Suspicious Reviews', `${legitimacy.totalSuspicious} (${legitimacy.suspiciousPercentage}%)`);
        addMetric('1-Review Accounts', `${legitimacy.oneReviewPercentage}%`);
        addMetric('Rating-Only Reviews', `${legitimacy.ratingOnlyPercentage}%`);
        addMetric('Duplicate Content', legitimacy.duplicateContentCount ?? 0);
        addMetric('Reviewer Diversity', legitimacy.reviewerDiversityIndex ?? 'N/A');
    }

    // ─── Sheet 2: All Reviews ───
    const reviewSheet = workbook.addWorksheet('All Reviews');
    reviewSheet.columns = [
        { header: 'Reviewer Name', key: 'name', width: 25 },
        { header: 'Rating', key: 'rating', width: 8 },
        { header: 'Review Text', key: 'text', width: 60 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Sentiment', key: 'sentiment', width: 12 },
        { header: 'Sentiment Score', key: 'sentimentScore', width: 14 },
        { header: 'Fake Score', key: 'fakeScore', width: 10 },
        { header: 'Flagged', key: 'flagged', width: 8 },
        { header: 'Owner Response', key: 'response', width: 50 },
        { header: 'Response Date', key: 'responseDate', width: 15 },
        { header: 'Reviewer Reviews', key: 'reviewCount', width: 14 },
        { header: 'Reviewer Photos', key: 'photoCount', width: 14 },
    ];

    // Style header
    const headerRow = reviewSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };

    reviews.forEach((r: any) => {
        const row = reviewSheet.addRow({
            name: r.reviewerName,
            rating: r.rating,
            text: r.text || '',
            date: r.publishedDate || '',
            sentiment: r.sentimentLabel || '',
            sentimentScore: r.sentimentScore ?? '',
            fakeScore: r.fakeScore ?? '',
            flagged: r.isLikelyFake ? '⚠️ YES' : 'No',
            response: r.responseText || '',
            responseDate: r.responseDate || '',
            reviewCount: r.reviewCount ?? '',
            photoCount: r.photoCount ?? '',
        });

        // Color-code by rating
        const ratingCell = row.getCell('rating');
        if (r.rating >= 4) ratingCell.font = { color: { argb: 'FF059669' }, bold: true };
        else if (r.rating <= 2) ratingCell.font = { color: { argb: 'FFDC2626' }, bold: true };

        // Color-code flagged
        if (r.isLikelyFake) {
            row.getCell('flagged').font = { color: { argb: 'FFDC2626' }, bold: true };
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            });
        }
    });

    // Auto-filter on reviews
    reviewSheet.autoFilter = { from: 'A1', to: 'L1' };

    // ─── Sheet 3: Strengths & Weaknesses ───
    if (overview || content) {
        const insightsSheet = workbook.addWorksheet('Insights');
        insightsSheet.columns = [
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Item', key: 'item', width: 60 },
        ];
        const insightHeader = insightsSheet.getRow(1);
        insightHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        insightHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };

        overview?.strengthsSummary?.forEach((s: string) => insightsSheet.addRow({ category: '✅ Strength', item: s }));
        overview?.weaknessesSummary?.forEach((w: string) => insightsSheet.addRow({ category: '⚠️ Weakness', item: w }));
        overview?.riskAlerts?.forEach((a: string) => insightsSheet.addRow({ category: '🚨 Risk', item: a }));
        content?.praiseThemes?.forEach((t: any) => insightsSheet.addRow({ category: '👍 Praise Theme', item: `${t.theme} (${t.count}x)` }));
        content?.complaintThemes?.forEach((t: any) => insightsSheet.addRow({ category: '👎 Complaint', item: `${t.theme} (${t.count}x)` }));
        content?.topKeywords?.forEach((k: any) => insightsSheet.addRow({ category: `🏷️ Keyword (${k.sentiment})`, item: `${k.word} (${k.count}x)` }));
    }

    // ─── Sheet 4: Action Items ───
    if (actions) {
        const actionsSheet = workbook.addWorksheet('Action Items');
        actionsSheet.columns = [
            { header: 'Priority', key: 'severity', width: 12 },
            { header: 'Issue', key: 'issue', width: 35 },
            { header: 'Evidence', key: 'evidence', width: 40 },
            { header: 'Suggestion', key: 'suggestion', width: 50 },
        ];
        const actionHeader = actionsSheet.getRow(1);
        actionHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        actionHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };

        actions.priorityIssues?.forEach((issue: any) => {
            actionsSheet.addRow({
                severity: issue.severity,
                issue: issue.issue,
                evidence: issue.evidence,
                suggestion: issue.suggestion,
            });
        });

        if (actions.quickWins?.length || actions.longTermStrategies?.length) {
            actionsSheet.addRow({});
            actions.quickWins?.forEach((w: string) => actionsSheet.addRow({ severity: '⚡ Quick Win', issue: w }));
            actions.longTermStrategies?.forEach((s: string) => actionsSheet.addRow({ severity: '🎯 Long-term', issue: s }));
        }
    }

    // ─── Sheet 5: Flagged Reviews ───
    const flagged = reviews.filter((r: any) => r.isLikelyFake);
    if (flagged.length > 0) {
        const flaggedSheet = workbook.addWorksheet('Flagged Reviews');
        flaggedSheet.columns = [
            { header: 'Reviewer', key: 'name', width: 25 },
            { header: 'Rating', key: 'rating', width: 8 },
            { header: 'Text', key: 'text', width: 50 },
            { header: 'Fake Score', key: 'fakeScore', width: 12 },
            { header: 'Reasons', key: 'reasons', width: 50 },
        ];
        const flagHeader = flaggedSheet.getRow(1);
        flagHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        flagHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };

        flagged.forEach((r: any) => {
            const reasons: string[] = [];
            if (!r.text || r.text.length < 20) reasons.push('Minimal text');
            if (r.reviewCount !== undefined && r.reviewCount <= 1) reasons.push('Single-review account');
            if (!r.photoCount) reasons.push('No photos');
            if ((r.rating === 1 || r.rating === 5) && (!r.text || r.text.length < 30)) reasons.push('Extreme rating, no detail');

            flaggedSheet.addRow({
                name: r.reviewerName,
                rating: r.rating,
                text: r.text || '(No text)',
                fakeScore: r.fakeScore,
                reasons: reasons.join('; ') || 'Multiple signals',
            });
        });
    }

    // ─── Sheet 6: Temporal Trends ───
    if (temporal?.reviewsPerMonth?.length) {
        const trendsSheet = workbook.addWorksheet('Monthly Trends');
        trendsSheet.columns = [
            { header: 'Month', key: 'month', width: 15 },
            { header: 'Review Count', key: 'count', width: 14 },
            { header: 'Avg Rating', key: 'avgRating', width: 12 },
        ];
        const trendHeader = trendsSheet.getRow(1);
        trendHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        trendHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };

        temporal.reviewsPerMonth.forEach((m: any) => {
            trendsSheet.addRow({ month: m.month, count: m.count, avgRating: m.avgRating ?? '' });
        });
    }

    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.businessName?.replace(/[^a-zA-Z0-9]/g, '_') || 'reviews'}_review_intelligence.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
}


// ============================================================
// JSON EXPORT — Structured data dump
// ============================================================
export function exportReviewsToJSON(data: any) {
    const analysis = JSON.parse(data.analysisData || '{}');
    const reviews = data.reviews || [];

    const exportData = {
        metadata: {
            businessName: data.businessName,
            businessUrl: data.businessUrl,
            totalReviews: data.totalReviews,
            averageRating: data.averageRating,
            analysisDate: data.createdAt,
            exportDate: new Date().toISOString(),
            generatedBy: 'GeoRanker Review Intelligence',
        },
        metrics: {
            overview: analysis.overview || null,
            sentiment: analysis.sentiment || null,
            ratings: analysis.ratings || null,
            responses: analysis.responses || null,
            legitimacy: analysis.legitimacy || null,
            content: analysis.content || null,
            temporal: analysis.temporal || null,
            actions: analysis.actions || null,
            competitive: analysis.competitive || null,
            reviewer: analysis.reviewer || null,
        },
        reviews: reviews.map((r: any) => ({
            reviewerName: r.reviewerName,
            reviewerUrl: r.reviewerUrl || null,
            reviewImage: r.reviewImage || null,
            rating: r.rating,
            text: r.text || null,
            publishedDate: r.publishedDate || null,
            responseText: r.responseText || null,
            responseDate: r.responseDate || null,
            sentimentLabel: r.sentimentLabel || null,
            sentimentScore: r.sentimentScore ?? null,
            fakeScore: r.fakeScore ?? null,
            isLikelyFake: r.isLikelyFake || false,
            reviewerMetadata: {
                reviewCount: r.reviewCount ?? null,
                photoCount: r.photoCount ?? null,
            },
        })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.businessName?.replace(/[^a-zA-Z0-9]/g, '_') || 'reviews'}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
}


// ============================================================
// PDF EXPORT — Comprehensive multi-page report
// ============================================================
export function exportReviewsToPDF(data: any) {
    const analysis = JSON.parse(data.analysisData || '{}');
    const reviews = data.reviews || [];
    const { overview, sentiment, ratings, responses, legitimacy, content, temporal, actions, competitive, reviewer } = analysis;

    const printWin = window.open('', '_blank');
    if (!printWin) { alert('Please allow popups to export PDF'); return; }

    const healthColor = overview?.healthScore >= 80 ? '#10b981' : overview?.healthScore >= 60 ? '#f59e0b' : '#ef4444';
    const sentimentColor = (overview?.sentimentScore ?? 0) > 0 ? '#10b981' : '#ef4444';

    // Helpers
    const esc = (s: any) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const starBar = (rating: number, pct: number, count: number) => `
        <div style="display:flex;align-items:center;gap:8px;margin:3px 0">
            <span style="width:25px;font-weight:700;font-size:13px;color:#374151">${rating}★</span>
            <div style="flex:1;height:18px;background:#e5e7eb;border-radius:9px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${rating >= 4 ? '#10b981' : rating === 3 ? '#f59e0b' : '#ef4444'};border-radius:9px"></div>
            </div>
            <span style="width:55px;text-align:right;font-size:11px;font-weight:600;color:#6b7280">${count} (${pct}%)</span>
        </div>`;
    const metricBox = (label: string, value: any, color: string, bg: string) =>
        `<div style="text-align:center;padding:14px;border-radius:12px;background:${bg}"><div style="font-size:26px;font-weight:800;color:${color}">${value}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;color:${color}">${label}</div></div>`;
    const starStr = (r: number) => '★'.repeat(r) + '☆'.repeat(5 - r);

    // Derived data
    const ratingBars = ratings?.distribution?.sort((a: any, b: any) => b.rating - a.rating)?.map((d: any) => starBar(d.rating, d.percentage, d.count)).join('') || '';
    const keywordTags = content?.topKeywords?.slice(0, 20)?.map((k: any) =>
        `<span style="display:inline-block;padding:4px 12px;margin:3px;border-radius:20px;font-size:11px;font-weight:600;background:${k.sentiment === 'positive' ? '#d1fae5' : k.sentiment === 'negative' ? '#fee2e2' : '#f3f4f6'};color:${k.sentiment === 'positive' ? '#065f46' : k.sentiment === 'negative' ? '#991b1b' : '#374151'}">${esc(k.word)} (${k.count})</span>`
    ).join('') || '';

    const flaggedReviews = reviews.filter((r: any) => r.isLikelyFake);
    const unrespondedNegative = reviews.filter((r: any) => r.rating <= 2 && !r.responseText);
    const unrespondedAll = reviews.filter((r: any) => !r.responseText);
    const respondedCount = reviews.filter((r: any) => r.responseText).length;

    const reviewCard = (r: any, showFlags = false) => {
        const reasons: string[] = [];
        if (showFlags) {
            if (!r.text || r.text.length < 20) reasons.push('Minimal text');
            if (r.reviewCount !== undefined && r.reviewCount <= 1) reasons.push('Single-review account');
            if (!r.photoCount) reasons.push('No photos on profile');
            if ((r.rating === 1 || r.rating === 5) && (!r.text || r.text.length < 30)) reasons.push('Extreme rating, no detail');
        }
        return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:8px 0;${r.isLikelyFake ? 'border-left:4px solid #ef4444' : ''};page-break-inside:avoid">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="display:flex;align-items:center;gap:8px">
                    <strong style="font-size:12px">${esc(r.reviewerName)}</strong>
                    <span style="font-size:16px;color:${r.rating >= 4 ? '#f59e0b' : r.rating <= 2 ? '#ef4444' : '#6b7280'}">${starStr(r.rating)}</span>
                    ${r.sentimentLabel ? `<span style="padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700;background:${r.sentimentLabel === 'POSITIVE' ? '#d1fae5' : r.sentimentLabel === 'NEGATIVE' ? '#fee2e2' : '#f3f4f6'};color:${r.sentimentLabel === 'POSITIVE' ? '#065f46' : r.sentimentLabel === 'NEGATIVE' ? '#991b1b' : '#374151'}">${r.sentimentLabel}</span>` : ''}
                    ${r.isLikelyFake ? `<span style="padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700;background:#fee2e2;color:#991b1b">⚠️ FLAGGED (${r.fakeScore}/100)</span>` : ''}
                </div>
                <span style="font-size:10px;color:#9ca3af">${r.publishedDate || ''}</span>
            </div>
            <p style="font-size:11px;color:#374151;margin:4px 0;line-height:1.5">${r.text ? esc(r.text) : '<em style="color:#9ca3af">No review text</em>'}</p>
            ${r.reviewCount != null ? `<div style="margin-top:4px;font-size:9px;color:#9ca3af">Reviewer: ${r.reviewCount} reviews · ${r.photoCount ?? 0} photos</div>` : ''}
            ${r.responseText ? `<div style="margin-top:8px;background:#eff6ff;padding:10px;border-radius:8px;border-left:3px solid #3b82f6">
                <div style="font-size:9px;font-weight:700;color:#2563eb;margin-bottom:3px">OWNER RESPONSE ${r.responseDate ? '· ' + r.responseDate : ''}</div>
                <p style="font-size:10px;color:#374151;line-height:1.4">${esc(r.responseText)}</p>
            </div>` : ''}
            ${showFlags && reasons.length > 0 ? `<div style="margin-top:6px;padding:6px 10px;background:#fef2f2;border-radius:6px;font-size:9px;color:#991b1b">Flags: ${reasons.join(' · ')}</div>` : ''}
        </div>`;
    };

    const issueCards = actions?.priorityIssues?.map((i: any) => `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:6px 0;page-break-inside:avoid">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <strong style="font-size:12px">${esc(i.issue)}</strong>
                <span style="padding:2px 10px;border-radius:6px;font-size:9px;font-weight:700;background:${i.severity === 'CRITICAL' || i.severity === 'URGENT' ? '#fee2e2' : '#fef3c7'};color:${i.severity === 'CRITICAL' || i.severity === 'URGENT' ? '#991b1b' : '#92400e'}">${i.severity}</span>
            </div>
            <p style="font-size:10px;color:#6b7280;margin:4px 0 0 0">Evidence: ${esc(i.evidence)}</p>
            <p style="font-size:10px;color:#059669;margin:2px 0 0 0">💡 ${esc(i.suggestion)}</p>
        </div>
    `).join('') || '';

    const trendRows = temporal?.reviewsPerMonth?.slice(-12)?.map((m: any) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px">${m.month}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center">${m.count}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center">${m.avgRating?.toFixed(1) ?? '-'}</td></tr>`).join('') || '';

    printWin.document.write(`<!DOCTYPE html><html><head>
        <title>${data.businessName} — Review Intelligence Report</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:'Inter',sans-serif; background:#f8fafc; color:#1a1a2e; width:800px; margin:0 auto; padding:30px; }
            .card { background:#fff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.1); padding:24px; margin-bottom:16px; page-break-inside:avoid; }
            .metric-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
            .two-col { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .section-title { font-size:16px; font-weight:800; margin-bottom:12px; padding-bottom:6px; border-bottom:2px solid #e5e7eb; color:#1a1a2e; }
            .page-break { page-break-before: always; }
            @media print {
                body { padding:10px; }
                .card { box-shadow:none; border:1px solid #e5e7eb; }
                .no-break { page-break-inside:avoid; }
            }
        </style>
    </head><body>

    <!-- ====== PAGE 1: HEADER + EXECUTIVE SUMMARY ====== -->
    <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:20px;padding:30px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
                <h1 style="font-size:28px;font-weight:800;margin-bottom:4px">${esc(data.businessName)}</h1>
                <p style="opacity:0.85;font-size:13px">Review Intelligence Report · ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p style="opacity:0.85;font-size:13px">⭐ ${data.averageRating?.toFixed(1)} average · ${data.totalReviews} total reviews · ${reviews.length} scraped & analyzed</p>
                <p style="opacity:0.7;font-size:11px;margin-top:4px">${data.businessUrl}</p>
            </div>
            <div style="background:${healthColor};border-radius:16px;padding:16px 24px;text-align:center;min-width:80px">
                <div style="font-size:34px;font-weight:800">${overview?.healthScore ?? '?'}</div>
                <div style="font-size:10px;font-weight:600;opacity:0.9">${overview?.gradeLabel ?? 'N/A'}</div>
            </div>
        </div>
    </div>

    <!-- KEY METRICS -->
    <div class="card">
        <div class="section-title">📊 Key Performance Metrics</div>
        <div class="metric-grid">
            ${metricBox('NPS Score', overview?.netPromoterScore ?? 'N/A', '#059669', '#ecfdf5')}
            ${metricBox('Response Rate', `${overview?.responseRate ?? 0}%`, '#2563eb', '#eff6ff')}
            ${metricBox('Trust Score', `${legitimacy?.overallTrustScore ?? 'N/A'}`, '#d97706', '#fef3c7')}
            ${metricBox('Sentiment', `${(overview?.sentimentScore ?? 0) > 0 ? '+' : ''}${overview?.sentimentScore ?? 0}`, sentimentColor, `${sentimentColor}15`)}
            ${metricBox('Fake Reviews', `${overview?.fakeReviewPercentage ?? 0}%`, '#7c3aed', '#faf5ff')}
            ${metricBox('Satisfaction', `${overview?.customerSatisfactionIndex ?? 0}%`, '#ea580c', '#fff7ed')}
            ${metricBox('Authenticity', `${overview?.reviewAuthenticityScore ?? 0}%`, '#0891b2', '#ecfeff')}
            ${metricBox('Engagement', `${overview?.engagementScore ?? 0}%`, '#4f46e5', '#eef2ff')}
            ${metricBox('Momentum', overview?.reputationMomentum || 'STABLE', '#6b7280', '#f9fafb')}
        </div>
    </div>

    <!-- RATINGS + SENTIMENT -->
    <div class="two-col">
        <div class="card">
            <div class="section-title">⭐ Rating Distribution</div>
            ${ratingBars}
            <div style="margin-top:10px;padding:10px;background:#f8fafc;border-radius:8px;font-size:11px;color:#6b7280">
                Trend: <strong>${ratings?.improvingOrDeclining ?? 'N/A'}</strong> · Velocity: <strong>${ratings?.ratingVelocity ?? 0}/mo</strong><br/>
                5★ Ratio: <strong>${ratings?.fiveStarRatio ?? 0}%</strong> · 1★ Ratio: <strong>${ratings?.oneStarRatio ?? 0}%</strong>
            </div>
        </div>
        <div class="card">
            <div class="section-title">💬 Sentiment Analysis</div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <div style="flex:1;text-align:center;padding:12px;background:#ecfdf5;border-radius:10px"><div style="font-size:24px;font-weight:800;color:#059669">${sentiment?.positiveCount ?? 0}</div><div style="font-size:9px;font-weight:600;color:#059669">POSITIVE</div></div>
                <div style="flex:1;text-align:center;padding:12px;background:#f3f4f6;border-radius:10px"><div style="font-size:24px;font-weight:800;color:#6b7280">${sentiment?.neutralCount ?? 0}</div><div style="font-size:9px;font-weight:600;color:#6b7280">NEUTRAL</div></div>
                <div style="flex:1;text-align:center;padding:12px;background:#fee2e2;border-radius:10px"><div style="font-size:24px;font-weight:800;color:#dc2626">${sentiment?.negativeCount ?? 0}</div><div style="font-size:9px;font-weight:600;color:#dc2626">NEGATIVE</div></div>
            </div>
            <div style="font-size:11px;color:#6b7280">
                Rating-Text Alignment: <strong>${sentiment?.ratingTextAlignment ?? 0}%</strong><br/>
                Sarcasm Suspects: <strong>${sentiment?.sarcasmSuspectCount ?? 0}</strong>
            </div>
        </div>
    </div>

    <!-- RESPONSE QUALITY + LEGITIMACY -->
    <div class="two-col">
        <div class="card">
            <div class="section-title">📝 Response Quality</div>
            <div style="font-size:12px;line-height:2">
                <div>Overall Response Rate: <strong>${responses?.responseRate ?? 0}%</strong> (${respondedCount}/${reviews.length})</div>
                <div>Negative Review Response Rate: <strong>${responses?.responseRateNegative ?? 0}%</strong></div>
                <div>Empathy Score: <strong>${responses?.empathyScore ?? 0}/100</strong></div>
                <div>Template Detection: <strong>${responses?.templateDetectionRate ?? 0}%</strong></div>
                <div>Avg Response Length: <strong>${responses?.avgResponseLength ?? 0} chars</strong></div>
                <div style="margin-top:4px;color:${unrespondedNegative.length > 0 ? '#dc2626' : '#059669'};font-weight:700">
                    ${unrespondedNegative.length > 0 ? `⚠️ ${unrespondedNegative.length} negative reviews without response` : '✅ All negative reviews responded to'}
                </div>
            </div>
        </div>
        <div class="card">
            <div class="section-title">🛡️ Legitimacy Analysis</div>
            <div style="font-size:12px;line-height:2">
                <div>Trust Score: <strong>${legitimacy?.overallTrustScore ?? 0}/100</strong></div>
                <div>Suspicious Reviews: <strong>${legitimacy?.totalSuspicious ?? 0}</strong> (${legitimacy?.suspiciousPercentage ?? 0}%)</div>
                <div>1-Review Accounts: <strong>${legitimacy?.oneReviewPercentage ?? 0}%</strong></div>
                <div>Rating-Only (no text): <strong>${legitimacy?.ratingOnlyPercentage ?? 0}%</strong></div>
                <div>Duplicate Content: <strong>${legitimacy?.duplicateContentCount ?? 0}</strong></div>
                <div>Reviewer Diversity: <strong>${legitimacy?.reviewerDiversityIndex ?? 'N/A'}</strong></div>
            </div>
        </div>
    </div>

    <!-- KEYWORDS -->
    ${keywordTags ? `<div class="card">
        <div class="section-title">🏷️ Top Keywords & Themes</div>
        <div>${keywordTags}</div>
        ${content?.praiseThemes?.length ? `<div style="margin-top:12px"><strong style="font-size:11px;color:#065f46">👍 Praise Themes:</strong><div style="font-size:11px;color:#374151;margin-top:4px">${content.praiseThemes.map((t: any) => `${esc(t.theme)} (${t.count}x)`).join(' · ')}</div></div>` : ''}
        ${content?.complaintThemes?.length ? `<div style="margin-top:8px"><strong style="font-size:11px;color:#991b1b">👎 Complaint Themes:</strong><div style="font-size:11px;color:#374151;margin-top:4px">${content.complaintThemes.map((t: any) => `${esc(t.theme)} (${t.count}x)`).join(' · ')}</div></div>` : ''}
    </div>` : ''}

    <!-- STRENGTHS / WEAKNESSES -->
    ${(overview?.strengthsSummary?.length || overview?.weaknessesSummary?.length) ? `<div class="two-col">
        ${overview?.strengthsSummary?.length ? `<div class="card" style="border-left:4px solid #10b981">
            <div class="section-title" style="color:#065f46;border-color:#d1fae5">✅ Strengths</div>
            <ul style="list-style:none;font-size:12px;line-height:1.8">${overview.strengthsSummary.map((s: string) => `<li style="color:#065f46">✅ ${esc(s)}</li>`).join('')}</ul>
        </div>` : ''}
        ${overview?.weaknessesSummary?.length ? `<div class="card" style="border-left:4px solid #ef4444">
            <div class="section-title" style="color:#991b1b;border-color:#fee2e2">⚠️ Weaknesses</div>
            <ul style="list-style:none;font-size:12px;line-height:1.8">${overview.weaknessesSummary.map((w: string) => `<li style="color:#991b1b">⚠️ ${esc(w)}</li>`).join('')}</ul>
        </div>` : ''}
    </div>` : ''}

    <!-- RISK ALERTS -->
    ${overview?.riskAlerts?.length ? `<div class="card" style="border-left:4px solid #f59e0b;background:#fffbeb">
        <div class="section-title" style="color:#92400e;border-color:#fde68a">🚨 Risk Alerts</div>
        <ul style="list-style:none;font-size:12px;line-height:1.8">${overview.riskAlerts.map((a: string) => `<li style="color:#92400e">🚨 ${esc(a)}</li>`).join('')}</ul>
    </div>` : ''}

    <!-- ACTION ITEMS -->
    ${issueCards ? `<div class="card">
        <div class="section-title">🎯 Priority Action Items</div>
        ${issueCards}
        ${actions?.quickWins?.length ? `<div style="margin-top:12px"><strong style="font-size:11px;color:#059669">⚡ Quick Wins:</strong><ul style="list-style:none;font-size:11px;margin-top:4px">${actions.quickWins.map((w: string) => `<li style="margin:3px 0;color:#065f46">→ ${esc(w)}</li>`).join('')}</ul></div>` : ''}
        ${actions?.longTermStrategies?.length ? `<div style="margin-top:8px"><strong style="font-size:11px;color:#4f46e5">🎯 Long-term Strategies:</strong><ul style="list-style:none;font-size:11px;margin-top:4px">${actions.longTermStrategies.map((s: string) => `<li style="margin:3px 0;color:#4338ca">→ ${esc(s)}</li>`).join('')}</ul></div>` : ''}
    </div>` : ''}

    <!-- MONTHLY TRENDS -->
    ${trendRows ? `<div class="card">
        <div class="section-title">📈 Monthly Trends (Last 12 Months)</div>
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f8fafc">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Month</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Reviews</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Avg Rating</th>
            </tr></thead>
            <tbody>${trendRows}</tbody>
        </table>
        ${temporal?.busiestDay ? `<div style="margin-top:10px;font-size:11px;color:#6b7280">Busiest Day: <strong>${temporal.busiestDay}</strong> · Review Acceleration: <strong>${temporal.reviewAcceleration ?? 'N/A'}</strong></div>` : ''}
    </div>` : ''}

    <!-- ====== FLAGGED REVIEWS ====== -->
    ${flaggedReviews.length > 0 ? `<div class="page-break"></div>
    <div class="card" style="border-left:4px solid #ef4444">
        <div class="section-title" style="color:#991b1b;border-color:#fee2e2">⚠️ Flagged Reviews (${flaggedReviews.length} suspicious)</div>
        <p style="font-size:11px;color:#6b7280;margin-bottom:12px">Reviews with a fake score of 50/100 or higher. These may be fake, incentivized, or from suspicious accounts.</p>
        ${flaggedReviews.map(r => reviewCard(r, true)).join('')}
    </div>` : ''}

    <!-- ====== UNRESPONDED NEGATIVE REVIEWS ====== -->
    ${unrespondedNegative.length > 0 ? `<div class="page-break"></div>
    <div class="card" style="border-left:4px solid #f59e0b">
        <div class="section-title" style="color:#92400e;border-color:#fde68a">📢 Unresponded Negative Reviews (${unrespondedNegative.length} reviews)</div>
        <p style="font-size:11px;color:#6b7280;margin-bottom:12px">These 1-2 star reviews have no owner response. Responding quickly can recover customer relationships and show potential customers you care.</p>
        ${unrespondedNegative.slice(0, 30).map(r => reviewCard(r, false)).join('')}
        ${unrespondedNegative.length > 30 ? `<div style="text-align:center;padding:12px;color:#6b7280;font-size:11px">... and ${unrespondedNegative.length - 30} more unresponded negative reviews</div>` : ''}
    </div>` : ''}

    <!-- ====== ALL REVIEWS LISTING ====== -->
    <div class="page-break"></div>
    <div class="card">
        <div class="section-title">📋 Complete Review Listing (${reviews.length} reviews)</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;font-size:11px;text-align:center">
            <div style="padding:8px;background:#ecfdf5;border-radius:8px"><strong style="color:#059669">${reviews.filter((r: any) => r.rating >= 4).length}</strong><div style="color:#059669;font-size:9px">4-5 Stars</div></div>
            <div style="padding:8px;background:#f3f4f6;border-radius:8px"><strong style="color:#6b7280">${reviews.filter((r: any) => r.rating === 3).length}</strong><div style="color:#6b7280;font-size:9px">3 Stars</div></div>
            <div style="padding:8px;background:#fee2e2;border-radius:8px"><strong style="color:#dc2626">${reviews.filter((r: any) => r.rating <= 2).length}</strong><div style="color:#dc2626;font-size:9px">1-2 Stars</div></div>
            <div style="padding:8px;background:#eff6ff;border-radius:8px"><strong style="color:#2563eb">${respondedCount}</strong><div style="color:#2563eb;font-size:9px">With Response</div></div>
        </div>
        ${reviews.slice(0, 100).map((r: any) => reviewCard(r, false)).join('')}
        ${reviews.length > 100 ? `<div style="text-align:center;padding:16px;color:#6b7280;font-size:12px;font-weight:600">Showing first 100 of ${reviews.length} reviews. Full data available in XLSX/JSON export.</div>` : ''}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:20px;color:#9ca3af;font-size:10px;border-top:1px solid #e5e7eb;margin-top:20px">
        <div style="font-weight:700;color:#7c3aed;margin-bottom:4px">GeoRanker Review Intelligence</div>
        Generated on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · 150+ Metric Deep Analysis · Powered by vdesignu.com
    </div>

    </body></html>`);

    printWin.document.close();
    setTimeout(() => { printWin.print(); }, 800);
}

