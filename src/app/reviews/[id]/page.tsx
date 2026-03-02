'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { exportReviewsToXLSX, exportReviewsToJSON, exportReviewsToPDF } from '@/lib/reviewExport';
import {
    ArrowLeft, Star, Shield, MessageSquareText, TrendingUp,
    AlertTriangle, CheckCircle, Users, BarChart3, Clock, Target,
    ThumbsUp, ThumbsDown, AlertCircle, Loader2, Search,
    Download, MapPin, ChevronDown, ChevronUp, Filter, FileText,
    Heart, Zap, Lightbulb, Flag, Eye, ImageIcon, Award, Flame, Gauge,
    TrendingDown, ShieldAlert, ShieldCheck, UserCheck, UserX,
    MessageCircle, Copy, Crosshair, Sparkles, CalendarDays,
    ArrowUpRight, ArrowDownRight, Minus, Camera, Hash, Quote,
    CircleDot, BrainCircuit, Fingerprint, Scale, Megaphone,
    PenTool, Activity, Trophy, CircleAlert, Info, ShieldX,
    Table, X, RefreshCw, FileJson, Image as ImageLucide
} from 'lucide-react';

export default function ReviewResultsPage() {
    const params = useParams();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [ratingFilter, setRatingFilter] = useState<number | null>(null);
    const [sentimentFilter, setSentimentFilter] = useState<string | null>(null);
    const [showAllReviews, setShowAllReviews] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [rerunning, setRerunning] = useState(false);
    const [rerunLogs, setRerunLogs] = useState<{ msg: string; type: 'info' | 'error' | 'success' }[]>([]);
    const [showRerunTerminal, setShowRerunTerminal] = useState(false);
    const [rerunTerminalCollapsed, setRerunTerminalCollapsed] = useState(false);

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            fetchData();
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    async function fetchData(runId?: string) {
        try {
            const qs = runId ? `?runId=${runId}` : '';
            const res = await fetch(`/api/reviews/${params.id}${qs}`);
            const json = await res.json();
            setData(json);
            if (json.activeRunId && !activeRunId) {
                setActiveRunId(json.activeRunId);
            }
        } catch { /* ignore */ } finally { setLoading(false); }
    }

    function switchRun(runId: string) {
        setActiveRunId(runId);
        fetchData(runId);
    }

    async function rerunAnalysis() {
        if (!data) return;
        if (!confirm(`Rerun analysis for "${data.businessName}"? This will scrape fresh reviews.`)) return;
        setRerunning(true);
        setRerunLogs([]);
        setShowRerunTerminal(true);
        setRerunTerminalCollapsed(false);

        try {
            const res = await fetch(`/api/reviews/${params.id}/rerun`, { method: 'POST' });
            if (!res.body) throw new Error('No response body');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.msg) {
                                setRerunLogs(prev => [...prev, { msg: parsed.msg, type: parsed.type }]);
                            }
                        } catch { /* ignore */ }
                    }
                }
            }

            setRerunning(false);
            setTimeout(() => {
                setShowRerunTerminal(false);
                fetchData(); // reload with latest run
            }, 2000);
        } catch (err: any) {
            setRerunLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
            setRerunning(false);
        }
    }

    // Filter reviews
    const filteredReviews = useMemo(() => {
        if (!data?.reviews) return [];
        let reviews = [...data.reviews];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            reviews = reviews.filter((r: any) =>
                r.text?.toLowerCase().includes(q) ||
                r.reviewerName?.toLowerCase().includes(q) ||
                r.responseText?.toLowerCase().includes(q)
            );
        }

        if (ratingFilter !== null) {
            reviews = reviews.filter((r: any) => r.rating === ratingFilter);
        }

        if (sentimentFilter) {
            reviews = reviews.filter((r: any) => r.sentimentLabel === sentimentFilter);
        }

        return reviews;
    }, [data?.reviews, searchQuery, ratingFilter, sentimentFilter]);

    async function handleExportXLSX() {
        if (!data) return;
        setExporting(true);
        try { await exportReviewsToXLSX(data); } catch (e) { console.error(e); } finally { setExporting(false); }
    }

    function handleExportJSON() {
        if (!data) return;
        exportReviewsToJSON(data);
    }

    function handleExportPDF() {
        if (!data) return;
        exportReviewsToPDF(data);
    }

    // Find reviews matching a keyword/phrase for source attribution
    const findSourceReviews = useCallback((keywords: string[], maxResults = 10): any[] => {
        if (!data?.reviews?.length) return [];
        const kw = keywords.map(k => k.toLowerCase());
        return data.reviews
            .filter((r: any) => r.text && kw.some((k: string) => r.text.toLowerCase().includes(k)))
            .slice(0, maxResults);
    }, [data?.reviews]);

    // PDF Export
    async function exportPDF() {
        setExporting(true);
        try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) { alert('Please allow popups to export PDF'); return; }
            const analysis = JSON.parse(data.analysisData || '{}');
            const { overview, sentiment, ratings, responses, legitimacy, content, temporal, actions, competitive, reviewer } = analysis;

            printWindow.document.write(`<!DOCTYPE html><html><head><title>${data.businessName} - Review Analysis</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; padding: 40px; font-size: 12px; line-height: 1.5; }
                .header { background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 30px; border-radius: 16px; margin-bottom: 30px; }
                .header h1 { font-size: 24px; margin-bottom: 4px; }
                .header .sub { opacity: 0.85; font-size: 13px; }
                .health-badge { display: inline-block; padding: 8px 16px; border-radius: 12px; font-weight: bold; font-size: 20px; margin-top: 10px; }
                .health-good { background: #10b981; color: white; }
                .health-mid { background: #f59e0b; color: white; }
                .health-bad { background: #ef4444; color: white; }
                .section { margin-bottom: 28px; page-break-inside: avoid; }
                .section h2 { font-size: 16px; color: #7c3aed; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 14px; }
                .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
                .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
                .stat { background: #f8f9fa; border-radius: 10px; padding: 12px; text-align: center; }
                .stat .label { font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 600; }
                .stat .value { font-size: 20px; font-weight: 700; margin-top: 2px; }
                .bar-container { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
                .bar-label { width: 40px; font-size: 11px; font-weight: 600; }
                .bar-track { flex: 1; height: 14px; background: #e5e7eb; border-radius: 7px; overflow: hidden; }
                .bar-fill { height: 100%; border-radius: 7px; }
                .bar-value { width: 60px; text-align: right; font-size: 11px; font-weight: 600; }
                .tag { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 600; margin: 2px; }
                .tag-pos { background: #d1fae5; color: #065f46; }
                .tag-neg { background: #fee2e2; color: #991b1b; }
                .tag-neu { background: #f3f4f6; color: #374151; }
                .issue { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 8px; }
                .issue-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
                .severity { padding: 2px 8px; border-radius: 6px; font-size: 9px; font-weight: 700; }
                .sev-urgent { background: #fee2e2; color: #991b1b; }
                .sev-high { background: #ffedd5; color: #9a3412; }
                .sev-medium { background: #fef3c7; color: #92400e; }
                .sev-low { background: #dbeafe; color: #1e40af; }
                .review-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-bottom: 6px; page-break-inside: avoid; }
                .review-meta { display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; margin-bottom: 4px; }
                .stars { color: #f59e0b; }
                .response { background: #f0fdf4; border-left: 3px solid #10b981; margin-top: 6px; padding: 8px; border-radius: 0 6px 6px 0; font-size: 11px; }
                .footer { text-align: center; color: #9ca3af; font-size: 10px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
                @media print { body { padding: 20px; } .header { break-inside: avoid; } }
            </style></head><body>
            <div class="header">
                <h1>📊 ${data.businessName}</h1>
                <div class="sub">Review Intelligence Report • ${new Date(data.createdAt).toLocaleDateString()} • ${data.totalReviews} reviews analyzed</div>
                <div class="sub">⭐ ${data.averageRating?.toFixed(1)} average rating</div>
                ${overview ? `<div class="health-badge ${overview.healthScore >= 80 ? 'health-good' : overview.healthScore >= 60 ? 'health-mid' : 'health-bad'}">
                    Health: ${overview.healthScore}/100 (${overview.gradeLabel})
                </div>` : ''}
            </div>

            ${overview ? `<div class="section">
                <h2>📋 Overview</h2>
                <div class="grid">
                    <div class="stat"><div class="label">Health Score</div><div class="value">${overview.healthScore}</div></div>
                    <div class="stat"><div class="label">Grade</div><div class="value">${overview.gradeLabel}</div></div>
                    <div class="stat"><div class="label">Sentiment</div><div class="value">${overview.sentimentScore > 0 ? '+' : ''}${overview.sentimentScore}</div></div>
                    <div class="stat"><div class="label">Response Rate</div><div class="value">${overview.responseRate}%</div></div>
                </div>
                ${overview.strengthsSummary?.length ? `<div style="margin-top:12px"><strong style="color:#059669">✅ Strengths:</strong><ul>${overview.strengthsSummary.map((s: string) => `<li>${s}</li>`).join('')}</ul></div>` : ''}
                ${overview.weaknessesSummary?.length ? `<div style="margin-top:8px"><strong style="color:#dc2626">⚠️ Weaknesses:</strong><ul>${overview.weaknessesSummary.map((w: string) => `<li>${w}</li>`).join('')}</ul></div>` : ''}
                ${overview.riskAlerts?.length ? `<div style="margin-top:8px"><strong style="color:#d97706">🚨 Risk Alerts:</strong><ul>${overview.riskAlerts.map((a: string) => `<li>${a}</li>`).join('')}</ul></div>` : ''}
            </div>` : ''}

            ${ratings ? `<div class="section">
                <h2>⭐ Rating Distribution</h2>
                ${[5, 4, 3, 2, 1].map(r => {
                const d = ratings.distribution?.find((x: any) => x.rating === r);
                return d ? `<div class="bar-container">
                        <div class="bar-label">${r} ★</div>
                        <div class="bar-track"><div class="bar-fill" style="width:${d.percentage}%;background:${r >= 4 ? '#10b981' : r === 3 ? '#f59e0b' : '#ef4444'}"></div></div>
                        <div class="bar-value">${d.count} (${d.percentage}%)</div>
                    </div>` : '';
            }).join('')}
                <div class="grid" style="margin-top:12px">
                    <div class="stat"><div class="label">Trend</div><div class="value">${ratings.improvingOrDeclining}</div></div>
                    <div class="stat"><div class="label">Velocity</div><div class="value">${ratings.ratingVelocity}/mo</div></div>
                    <div class="stat"><div class="label">5★ Ratio</div><div class="value">${ratings.fiveStarRatio}%</div></div>
                    <div class="stat"><div class="label">1★ Ratio</div><div class="value">${ratings.oneStarRatio}%</div></div>
                </div>
            </div>` : ''}

            ${sentiment ? `<div class="section">
                <h2>💬 Sentiment Analysis</h2>
                <div class="grid">
                    <div class="stat"><div class="label">Overall</div><div class="value">${sentiment.overallLabel}</div></div>
                    <div class="stat"><div class="label">Positive</div><div class="value" style="color:#059669">${sentiment.positiveCount}</div></div>
                    <div class="stat"><div class="label">Negative</div><div class="value" style="color:#dc2626">${sentiment.negativeCount}</div></div>
                    <div class="stat"><div class="label">Neutral</div><div class="value">${sentiment.neutralCount}</div></div>
                </div>
            </div>` : ''}

            ${responses ? `<div class="section">
                <h2>💬 Response Quality</h2>
                <div class="grid">
                    <div class="stat"><div class="label">Response Rate</div><div class="value">${responses.responseRate}%</div></div>
                    <div class="stat"><div class="label">Neg Response Rate</div><div class="value">${responses.responseRateNegative}%</div></div>
                    <div class="stat"><div class="label">Empathy Score</div><div class="value">${responses.empathyScore}/100</div></div>
                    <div class="stat"><div class="label">Template Rate</div><div class="value">${responses.templateDetectionRate}%</div></div>
                </div>
            </div>` : ''}

            ${legitimacy ? `<div class="section">
                <h2>🛡️ Reviewer Legitimacy</h2>
                <div class="grid">
                    <div class="stat"><div class="label">Trust Score</div><div class="value">${legitimacy.overallTrustScore}/100</div></div>
                    <div class="stat"><div class="label">Suspicious</div><div class="value" style="color:#dc2626">${legitimacy.totalSuspicious} (${legitimacy.suspiciousPercentage}%)</div></div>
                    <div class="stat"><div class="label">1-Review Accts</div><div class="value">${legitimacy.oneReviewPercentage}%</div></div>
                    <div class="stat"><div class="label">Rating-Only</div><div class="value">${legitimacy.ratingOnlyPercentage}%</div></div>
                </div>
            </div>` : ''}

            ${content ? `<div class="section">
                <h2>🏷️ Content & Topics</h2>
                <div style="margin-bottom:10px">
                    <strong>Top Keywords:</strong><br/>
                    ${content.topKeywords?.map((k: any) => `<span class="tag ${k.sentiment === 'positive' ? 'tag-pos' : k.sentiment === 'negative' ? 'tag-neg' : 'tag-neu'}">${k.word} (${k.count})</span>`).join('') || 'None'}
                </div>
                ${content.praiseThemes?.length ? `<div style="margin-bottom:10px"><strong style="color:#059669">Praise Themes:</strong> ${content.praiseThemes.map((t: any) => t.theme + ' (' + t.count + ')').join(', ')}</div>` : ''}
                ${content.complaintThemes?.length ? `<div style="margin-bottom:10px"><strong style="color:#dc2626">Complaint Themes:</strong> ${content.complaintThemes.map((t: any) => t.theme + ' (' + t.count + ')').join(', ')}</div>` : ''}
            </div>` : ''}

            ${actions ? `<div class="section">
                <h2>🎯 Action Items</h2>
                ${actions.overallRecommendation ? `<p style="margin-bottom:10px;color:#7c3aed;font-weight:600">${actions.overallRecommendation}</p>` : ''}
                ${actions.priorityIssues?.map((issue: any) => `<div class="issue">
                    <div class="issue-header"><strong>${issue.issue}</strong><span class="severity sev-${issue.severity.toLowerCase()}">${issue.severity}</span></div>
                    <div style="color:#6b7280;font-size:11px">${issue.evidence}</div>
                    <div style="margin-top:4px;font-size:11px">💡 ${issue.suggestion}</div>
                </div>`).join('') || ''}
            </div>` : ''}

            <div class="section">
                <h2>📝 All Reviews (${data.reviews?.length || 0})</h2>
                ${(data.reviews || []).slice(0, 50).map((r: any) => `<div class="review-card">
                    <div class="review-meta">
                        <span><strong>${r.reviewerName}</strong></span>
                        <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    ${r.text ? `<div style="font-size:11px">${r.text}</div>` : '<div style="font-size:11px;color:#9ca3af"><em>Rating only — no text</em></div>'}
                    ${r.reviewImage ? `<div style="margin-top:8px;"><img src="${r.reviewImage}" alt="Review image" style="max-width:100px; height:auto; border-radius:4px; border:1px solid #e5e7eb;" /></div>` : ''}
                    ${r.publishedDate ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px">${r.publishedDate}</div>` : ''}
                    ${r.responseText ? `<div class="response"><strong>Owner Response:</strong> ${r.responseText}</div>` : ''}
                </div>`).join('')}
                ${(data.reviews?.length || 0) > 50 ? `<p style="color:#6b7280;text-align:center">... and ${data.reviews.length - 50} more reviews</p>` : ''}
            </div>

            <div class="footer">Generated by GeoRanker Review Intelligence • ${new Date().toLocaleDateString()} • Powered by 150+ Metric Deep Analysis • Powered by vdesignu.com</div>
            </body></html>`);

            printWindow.document.close();
            setTimeout(() => { printWindow.print(); }, 500);
        } catch (err) {
            console.error('PDF export error:', err);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setExporting(false);
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-96 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mr-3" /> Loading analysis...
        </div>
    );

    if (!data) return (
        <div className="text-center py-20 text-gray-500">Analysis not found.</div>
    );

    if (data.status !== 'COMPLETED') return (
        <div className="space-y-8">
            <Link href="/reviews" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back to Reviews
            </Link>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                {data.status === 'FAILED' ? (
                    <>
                        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-4" />
                        <h2 className="text-lg font-semibold text-gray-900 mb-1">{data.businessName}</h2>
                        <p className="text-sm text-red-500">Failed: {data.error}</p>
                    </>
                ) : (
                    <>
                        <Loader2 className="w-10 h-10 animate-spin text-violet-500 mx-auto mb-4" />
                        <h2 className="text-lg font-semibold text-gray-900 mb-1">{data.businessName}</h2>
                        <p className="text-sm text-gray-500">
                            {data.status === 'SCRAPING' ? 'Scraping reviews from Google Maps...' :
                                data.status === 'ANALYZING' ? 'Running 150+ metric deep analysis...' : 'Pending...'}
                        </p>
                        <div className="mt-4 w-48 h-2 bg-gray-100 rounded-full mx-auto overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full animate-pulse" style={{ width: data.status === 'SCRAPING' ? '40%' : '75%' }} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    const analysis = JSON.parse(data.analysisData || '{}');
    const { overview, sentiment, ratings, responses, legitimacy, content, temporal, actions, competitive, reviewer } = analysis;

    return (
        <div className="space-y-8 pb-12">
            {/* ==================== HEADER ==================== */}
            <div className="flex items-start justify-between">
                <div>
                    <Link href="/reviews" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-2">
                        <ArrowLeft className="w-3 h-3" /> Back
                    </Link>
                    <h1 className="text-xl font-bold text-gray-900">{data.businessName}</h1>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                            {data.averageRating?.toFixed(1)}
                        </span>
                        <span>{data.totalReviews} reviews</span>
                        <span>{new Date(data.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Rerun Button */}
                    <button
                        onClick={rerunAnalysis}
                        disabled={rerunning}
                        className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                        {rerunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {rerunning ? 'Running...' : 'Rerun'}
                    </button>

                    {/* XLSX Export Button */}
                    <button
                        onClick={handleExportXLSX}
                        disabled={exporting}
                        className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table className="w-4 h-4" />}
                        {exporting ? 'Exporting...' : 'XLSX'}
                    </button>

                    {/* JSON Export Button */}
                    <button
                        onClick={handleExportJSON}
                        className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                        <FileJson className="w-4 h-4" />
                        JSON
                    </button>

                    {/* PDF Export Button */}
                    <button
                        onClick={handleExportPDF}
                        className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        PDF Report
                    </button>

                    {/* Health Score */}
                    {overview && (
                        <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center text-white font-bold shadow-lg ${overview.healthScore >= 80 ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-200' :
                            overview.healthScore >= 60 ? 'bg-gradient-to-br from-amber-500 to-yellow-600 shadow-amber-200' :
                                'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-200'
                            }`}>
                            <span className="text-2xl">{overview.healthScore}</span>
                            <span className="text-[10px] opacity-80">{overview.gradeLabel}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ==================== RUN TIMELINE ==================== */}
            {data.runs && data.runs.length > 1 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-violet-500" />
                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Run History</h3>
                        <span className="text-[10px] text-gray-400 ml-auto">{data.runs.length} runs</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {data.runs.map((run: any) => (
                            <button
                                key={run.runId}
                                onClick={() => switchRun(run.runId)}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeRunId === run.runId
                                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                <CalendarDays className="w-3 h-3" />
                                {new Date(run.runAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${activeRunId === run.runId ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                    {run.reviewCount} reviews
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ==================== OVERVIEW STATS ==================== */}
            {overview && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <StatCard icon={<Gauge className="w-3 h-3" />} label="Health Score" value={overview.healthScore} color={overview.healthScore >= 80 ? 'green' : overview.healthScore >= 60 ? 'amber' : 'red'} />
                        <StatCard icon={<Star className="w-3 h-3" />} label="Avg Rating" value={overview.averageRating} color="amber" />
                        <StatCard icon={<Scale className="w-3 h-3" />} label="NPS" value={overview.netPromoterScore ?? 'N/A'} color={(overview.netPromoterScore ?? 0) > 30 ? 'green' : (overview.netPromoterScore ?? 0) > 0 ? 'amber' : 'red'} />
                        <StatCard icon={<MessageCircle className="w-3 h-3" />} label="Response Rate" value={`${overview.responseRate}%`} color={overview.responseRate > 50 ? 'green' : 'red'} />
                        <StatCard icon={<ShieldCheck className="w-3 h-3" />} label="Trust Score" value={legitimacy?.overallTrustScore || 'N/A'} color={legitimacy?.overallTrustScore > 70 ? 'green' : 'red'} />
                        <StatCard icon={<Flag className="w-3 h-3" />} label="Fake Reviews" value={`${overview.fakeReviewPercentage}%`} color={overview.fakeReviewPercentage > 15 ? 'red' : 'green'} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <StatCard icon={<Heart className="w-3 h-3" />} label="Satisfaction" value={`${overview.customerSatisfactionIndex ?? 0}%`} color={(overview.customerSatisfactionIndex ?? 0) > 70 ? 'green' : 'amber'} />
                        <StatCard icon={<Fingerprint className="w-3 h-3" />} label="Authenticity" value={`${overview.reviewAuthenticityScore ?? 0}%`} color={(overview.reviewAuthenticityScore ?? 0) > 80 ? 'green' : 'red'} />
                        <StatCard icon={<Activity className="w-3 h-3" />} label="Engagement" value={`${overview.engagementScore ?? 0}%`} color={(overview.engagementScore ?? 0) > 50 ? 'green' : 'amber'} />
                        <StatCard icon={<TrendingUp className="w-3 h-3" />} label="Momentum" value={overview.reputationMomentum || 'STABLE'} color={overview.reputationMomentum === 'RISING' ? 'green' : overview.reputationMomentum === 'FALLING' ? 'red' : 'gray'} />
                        <StatCard icon={<BrainCircuit className="w-3 h-3" />} label="Sentiment" value={overview.sentimentScore > 0 ? `+${overview.sentimentScore}` : overview.sentimentScore} color={overview.sentimentScore > 0 ? 'green' : 'red'} />
                    </div>
                </>
            )}

            {/* Strengths, Weaknesses, Risks */}
            {overview && (
                <div className="grid md:grid-cols-3 gap-4">
                    {overview.strengthsSummary?.length > 0 && (
                        <div className="bg-emerald-50/70 rounded-xl p-4 border border-emerald-100">
                            <h3 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                                <Trophy className="w-4 h-4" /> Strengths
                            </h3>
                            <ul className="space-y-1.5">
                                {overview.strengthsSummary.map((s: string, i: number) => (
                                    <li key={i} className="text-xs text-emerald-700 flex items-start gap-1.5">
                                        <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" /> {s}
                                    </li>
                                ))}
                            </ul>
                            <SourceReviews reviews={(data?.reviews || []).filter((r: any) => r.rating >= 4 && r.text).slice(0, 8)} label="positive" />
                        </div>
                    )}
                    {overview.weaknessesSummary?.length > 0 && (
                        <div className="bg-red-50/70 rounded-xl p-4 border border-red-100">
                            <h3 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Weaknesses
                            </h3>
                            <ul className="space-y-1.5">
                                {overview.weaknessesSummary.map((w: string, i: number) => (
                                    <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                                        <Minus className="w-3 h-3 mt-0.5 shrink-0" /> {w}
                                    </li>
                                ))}
                            </ul>
                            <SourceReviews reviews={(data?.reviews || []).filter((r: any) => r.rating <= 2 && r.text).slice(0, 8)} label="negative" />
                        </div>
                    )}
                    {overview.riskAlerts?.length > 0 && (
                        <div className="bg-amber-50/70 rounded-xl p-4 border border-amber-100">
                            <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4" /> Risk Alerts
                            </h3>
                            <ul className="space-y-1.5">
                                {overview.riskAlerts.map((a: string, i: number) => (
                                    <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                                        <CircleAlert className="w-3 h-3 mt-0.5 shrink-0" /> {a}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* ==================== RATING DISTRIBUTION ==================== */}
            {ratings && (
                <Section title="Rating Distribution" icon={<Star className="w-4 h-4 text-amber-500" />}>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            {[5, 4, 3, 2, 1].map(r => {
                                const d = ratings.distribution?.find((x: any) => x.rating === r);
                                if (!d) return null;
                                return (
                                    <div key={r} className="flex items-center gap-3">
                                        <span className="text-xs font-semibold w-8 text-gray-600">{r} ★</span>
                                        <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${r >= 4 ? 'bg-emerald-400' : r === 3 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${d.percentage}%` }} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-600 w-20 text-right">{d.count} ({d.percentage}%)</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <StatCard icon={<Star className="w-3 h-3" />} label="5★ Ratio" value={`${ratings.fiveStarRatio}%`} color="green" />
                            <StatCard icon={<Star className="w-3 h-3" />} label="1★ Ratio" value={`${ratings.oneStarRatio}%`} color="red" />
                            <StatCard icon={ratings.improvingOrDeclining === 'IMPROVING' ? <ArrowUpRight className="w-3 h-3" /> : ratings.improvingOrDeclining === 'DECLINING' ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />} label="Trend" value={ratings.improvingOrDeclining} color={ratings.improvingOrDeclining === 'IMPROVING' ? 'green' : ratings.improvingOrDeclining === 'DECLINING' ? 'red' : 'gray'} />
                            <StatCard icon={<Flame className="w-3 h-3" />} label="Velocity" value={`${ratings.ratingVelocity}/mo`} color="blue" />
                        </div>
                    </div>
                </Section>
            )}

            {/* ==================== SENTIMENT ==================== */}
            {sentiment && (
                <Section title="Sentiment Analysis" icon={<ThumbsUp className="w-4 h-4 text-emerald-500" />}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <StatCard icon={<BrainCircuit className="w-3 h-3" />} label="Overall" value={sentiment.overallLabel} color={sentiment.overallScore > 0 ? 'green' : 'red'} />
                        <StatCard icon={<ThumbsUp className="w-3 h-3" />} label="Positive" value={sentiment.positiveCount} color="green" />
                        <StatCard icon={<ThumbsDown className="w-3 h-3" />} label="Negative" value={sentiment.negativeCount} color="red" />
                        <StatCard icon={<Minus className="w-3 h-3" />} label="Neutral" value={sentiment.neutralCount} color="gray" />
                    </div>

                    {/* Emotions */}
                    {sentiment.emotionBreakdown?.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Heart className="w-3 h-3 text-pink-500" /> Emotion Breakdown</p>
                            <div className="flex flex-wrap gap-2">
                                {sentiment.emotionBreakdown.map((e: any) => (
                                    <span key={e.emotion} className="px-3 py-1.5 bg-violet-50 text-violet-700 rounded-full text-xs font-medium">
                                        {e.emotion} ({e.count})
                                    </span>
                                ))}
                            </div>
                            <SourceReviews reviews={(data?.reviews || []).filter((r: any) => r.text && r.sentimentLabel).slice(0, 10)} label="emotional" />
                        </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-4">
                        {sentiment.mostPositiveReview && (
                            <div className="bg-emerald-50 rounded-xl p-4">
                                <h4 className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> Most Positive</h4>
                                <p className="text-xs text-emerald-800 italic line-clamp-3">&ldquo;{sentiment.mostPositiveReview.text}&rdquo;</p>
                                <p className="text-[10px] text-emerald-600 mt-1">— {sentiment.mostPositiveReview.reviewer}</p>
                            </div>
                        )}
                        {sentiment.mostNegativeReview && (
                            <div className="bg-red-50 rounded-xl p-4">
                                <h4 className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1"><ThumbsDown className="w-3 h-3" /> Most Negative</h4>
                                <p className="text-xs text-red-800 italic line-clamp-3">&ldquo;{sentiment.mostNegativeReview.text}&rdquo;</p>
                                <p className="text-[10px] text-red-600 mt-1">— {sentiment.mostNegativeReview.reviewer}</p>
                            </div>
                        )}
                    </div>

                    {/* Aspect-based sentiments */}
                    {sentiment.aspectSentiments?.length > 0 && (
                        <div className="mt-4">
                            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Crosshair className="w-3 h-3 text-indigo-500" /> Sentiment by Business Aspect</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {sentiment.aspectSentiments.map((a: any) => (
                                    <div key={a.aspect} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                        <p className="text-xs font-bold text-gray-800">{a.aspect}</p>
                                        <div className="flex gap-3 mt-1.5">
                                            <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" />{a.positive}</span>
                                            <span className="text-[10px] text-red-600 flex items-center gap-0.5"><ThumbsDown className="w-2.5 h-2.5" />{a.negative}</span>
                                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" />{a.neutral}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {sentiment.aspectSentiments.map((a: any) => {
                                const matches = findSourceReviews([a.aspect.toLowerCase()], 5);
                                return matches.length > 0 ? <SourceReviews key={`src-${a.aspect}`} reviews={matches} label={a.aspect} /> : null;
                            })}
                        </div>
                    )}

                    {/* Rating-text alignment */}
                    {sentiment.ratingTextAlignment !== undefined && (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <StatCard icon={<Crosshair className="w-3 h-3" />} label="Rating-Text Alignment" value={`${sentiment.ratingTextAlignment}%`} color={sentiment.ratingTextAlignment > 70 ? 'green' : 'amber'} />
                            <StatCard icon={<Eye className="w-3 h-3" />} label="Sarcasm Suspects" value={sentiment.sarcasmSuspectCount ?? 0} color={(sentiment.sarcasmSuspectCount ?? 0) > 3 ? 'red' : 'green'} />
                        </div>
                    )}
                </Section>
            )}

            {/* ==================== RESPONSE QUALITY ==================== */}
            {responses && (
                <Section title="Response Quality" icon={<MessageSquareText className="w-4 h-4 text-blue-500" />}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard icon={<MessageCircle className="w-3 h-3" />} label="Response Rate" value={`${responses.responseRate}%`} color={responses.responseRate > 50 ? 'green' : 'red'} />
                        <StatCard icon={<ShieldAlert className="w-3 h-3" />} label="Neg. Response" value={`${responses.responseRateNegative}%`} color={responses.responseRateNegative > 80 ? 'green' : 'red'} />
                        <StatCard icon={<Heart className="w-3 h-3" />} label="Empathy" value={`${responses.empathyScore}/100`} color={responses.empathyScore > 50 ? 'green' : 'amber'} />
                        <StatCard icon={<Copy className="w-3 h-3" />} label="Template %" value={`${responses.templateDetectionRate}%`} color={responses.templateDetectionRate > 30 ? 'red' : 'green'} />
                    </div>
                </Section>
            )}

            {/* ==================== LEGITIMACY ==================== */}
            {legitimacy && (
                <Section title="Reviewer Legitimacy" icon={<Shield className="w-4 h-4 text-violet-500" />}>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        <StatCard icon={<Shield className="w-3 h-3" />} label="Trust Score" value={`${legitimacy.overallTrustScore}/100`} color={legitimacy.overallTrustScore > 70 ? 'green' : 'red'} />
                        <StatCard icon={<ShieldX className="w-3 h-3" />} label="Suspicious" value={`${legitimacy.totalSuspicious} (${legitimacy.suspiciousPercentage}%)`} color={legitimacy.suspiciousPercentage > 15 ? 'red' : 'green'} />

                        <StatCard icon={<UserX className="w-3 h-3" />} label="1-Review Accts" value={`${legitimacy.oneReviewPercentage}%`} color={legitimacy.oneReviewPercentage > 40 ? 'red' : 'green'} />
                        <StatCard icon={<Star className="w-3 h-3" />} label="Rating-Only" value={`${legitimacy.ratingOnlyPercentage}%`} color="amber" />
                    </div>



                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        <StatCard icon={<Users className="w-3 h-3" />} label="Reviewer Diversity" value={legitimacy.reviewerDiversityIndex ?? 'N/A'} color="blue" />
                        <StatCard icon={<Award className="w-3 h-3" />} label="Avg Reviewer Exp." value={`${legitimacy.averageReviewerExperience ?? 0} reviews`} color="violet" />
                        <StatCard icon={<Copy className="w-3 h-3" />} label="Duplicate Content" value={legitimacy.duplicateContentCount ?? 0} color={(legitimacy.duplicateContentCount ?? 0) > 2 ? 'red' : 'green'} />
                    </div>

                    {legitimacy.suspiciousPatterns?.length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                            {legitimacy.suspiciousPatterns.map((p: string, i: number) => (
                                <p key={i} className="text-xs text-amber-700 flex items-center gap-1.5 py-0.5">
                                    <Search className="w-3 h-3 shrink-0" /> {p}
                                </p>
                            ))}
                            <SourceReviews reviews={(data?.reviews || []).filter((r: any) => r.isLikelyFake).slice(0, 8)} label="suspicious" />
                        </div>
                    )}
                </Section>
            )}

            {/* ==================== TOPICS & KEYWORDS ==================== */}
            {content && (
                <Section title="Topics & Keywords" icon={<FileText className="w-4 h-4 text-indigo-500" />}>
                    {/* Top Keywords as Tags */}
                    {content.topKeywords?.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Hash className="w-3 h-3 text-indigo-500" /> Most Mentioned Words</p>
                            <div className="flex flex-wrap gap-2">
                                {content.topKeywords.map((k: any) => (
                                    <span key={k.word} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${k.sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                        k.sentiment === 'negative' ? 'bg-red-100 text-red-700 border border-red-200' :
                                            'bg-gray-100 text-gray-700 border border-gray-200'
                                        }`}>
                                        {k.word} <span className="opacity-60">({k.count})</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Phrases */}
                    {content.topPhrases?.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Quote className="w-3 h-3 text-blue-500" /> Common Phrases</p>
                            <div className="flex flex-wrap gap-2">
                                {content.topPhrases.map((p: any) => (
                                    <span key={p.phrase} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                                        &ldquo;{p.phrase}&rdquo; ({p.count})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Themes */}
                    <div className="grid md:grid-cols-2 gap-4">
                        {content.praiseThemes?.length > 0 && (
                            <div className="bg-emerald-50/70 rounded-xl p-4 border border-emerald-100">
                                <h4 className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1.5"><CheckCircle className="w-3 h-3" /> Praise Themes</h4>
                                {content.praiseThemes.map((t: any) => (
                                    <div key={t.theme} className="mb-2">
                                        <p className="text-xs font-semibold text-emerald-700">{t.theme} ({t.count})</p>
                                        {t.examples?.slice(0, 1).map((e: string, i: number) => (
                                            <p key={i} className="text-[10px] text-emerald-600 italic">&ldquo;{e}&rdquo;</p>
                                        ))}
                                        <SourceReviews reviews={findSourceReviews(t.theme.toLowerCase().split(/\s+/), 5)} label={t.theme} />
                                    </div>
                                ))}
                            </div>
                        )}
                        {content.complaintThemes?.length > 0 && (
                            <div className="bg-red-50/70 rounded-xl p-4 border border-red-100">
                                <h4 className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Complaint Themes</h4>
                                {content.complaintThemes.map((t: any) => (
                                    <div key={t.theme} className="mb-2">
                                        <p className="text-xs font-semibold text-red-700">{t.theme} ({t.count})</p>
                                        {t.examples?.slice(0, 1).map((e: string, i: number) => (
                                            <p key={i} className="text-[10px] text-red-600 italic">&ldquo;{e}&rdquo;</p>
                                        ))}
                                        <SourceReviews reviews={findSourceReviews(t.theme.toLowerCase().split(/\s+/), 5)} label={t.theme} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ==================== TEMPORAL TRENDS ==================== */}
            {temporal && (
                <Section title="Review Trends" icon={<Clock className="w-4 h-4 text-teal-500" />}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <StatCard icon={<CalendarDays className="w-3 h-3" />} label="Avg Reviews/Mo" value={temporal.averageReviewsPerMonth} color="blue" />
                        <StatCard icon={<TrendingUp className="w-3 h-3" />} label="Busiest Month" value={temporal.busiestMonth || 'N/A'} color="green" />
                        <StatCard icon={<TrendingDown className="w-3 h-3" />} label="Slowest Month" value={temporal.slowestMonth || 'N/A'} color="amber" />
                        <StatCard icon={<Clock className="w-3 h-3" />} label="Recency" value={`${temporal.recencyScore}/100`} color="violet" />
                    </div>

                    {temporal.reviewsPerMonth?.length > 0 && (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {temporal.reviewsPerMonth.slice(-12).map((m: any) => {
                                const maxCount = Math.max(...temporal.reviewsPerMonth.map((x: any) => x.count), 1);
                                return (
                                    <div key={m.month} className="flex items-center gap-3">
                                        <span className="text-xs font-medium w-16 text-gray-600">{m.month}</span>
                                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-violet-400 rounded-full" style={{ width: `${(m.count / maxCount) * 100}%` }} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-600 w-8 text-right">{m.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Section>
            )}

            {/* ==================== COMPETITIVE BENCHMARKS ==================== */}
            {competitive && competitive.industryBenchmark?.length > 0 && (
                <Section title="Competitive Benchmarks" icon={<BarChart3 className="w-4 h-4 text-indigo-500" />}>
                    <div className="grid md:grid-cols-5 gap-3 mb-4">
                        {competitive.industryBenchmark.map((b: any) => (
                            <div key={b.metric} className={`rounded-xl p-3 text-center ${b.verdict === 'Above Average' || b.verdict === 'Strong' || b.verdict === 'Healthy' || b.verdict === 'Good' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                <p className="text-[10px] font-semibold text-gray-500">{b.metric}</p>
                                <p className="text-lg font-bold">{typeof b.yours === 'number' ? (b.yours % 1 ? b.yours.toFixed(1) : b.yours) : b.yours}</p>
                                <p className="text-[10px] text-gray-400">Benchmark: {b.benchmark}</p>
                                <p className={`text-[10px] font-bold ${b.verdict === 'Above Average' || b.verdict === 'Strong' || b.verdict === 'Healthy' || b.verdict === 'Good' ? 'text-emerald-600' : 'text-red-600'}`}>{b.verdict}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500">Market Position: <span className="font-bold text-gray-800">{competitive.marketPositioning}</span></p>
                </Section>
            )}

            {/* ==================== ACTION ITEMS ==================== */}
            {actions && (
                <Section title="Action Items" icon={<Target className="w-4 h-4 text-red-500" />}>
                    {actions.overallRecommendation && (
                        <div className="bg-violet-50/70 rounded-xl p-4 mb-4 border border-violet-100">
                            <p className="text-xs font-semibold text-violet-800 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> {actions.overallRecommendation}</p>
                        </div>
                    )}

                    {actions.priorityIssues?.length > 0 && (
                        <div className="space-y-3 mb-4">
                            {actions.priorityIssues.map((issue: any, i: number) => (
                                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-sm font-semibold text-gray-900">{issue.issue}</h4>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${issue.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' : issue.severity === 'URGENT' ? 'bg-red-100 text-red-700' :
                                            issue.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                                                issue.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-blue-100 text-blue-700'
                                            }`}>{issue.severity}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mb-2">{issue.evidence}</p>
                                    <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2 flex items-start gap-1.5">
                                        <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" /> {issue.suggestion}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick Wins & Long-term */}
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                        {actions.quickWins?.length > 0 && (
                            <div className="bg-emerald-50/70 rounded-xl p-4 border border-emerald-100">
                                <h4 className="text-xs font-bold text-emerald-800 mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Quick Wins</h4>
                                <ul className="space-y-1.5">
                                    {actions.quickWins.map((w: string, i: number) => (
                                        <li key={i} className="text-xs text-emerald-700 flex items-start gap-1.5">
                                            <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" /> {w}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {actions.longTermStrategies?.length > 0 && (
                            <div className="bg-blue-50/70 rounded-xl p-4 border border-blue-100">
                                <h4 className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Long-Term Strategies</h4>
                                <ul className="space-y-1.5">
                                    {actions.longTermStrategies.map((s: string, i: number) => (
                                        <li key={i} className="text-xs text-blue-700 flex items-start gap-1.5">
                                            <Crosshair className="w-3 h-3 mt-0.5 shrink-0" /> {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Suggested Responses */}
                    {actions.suggestedResponses?.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><PenTool className="w-3 h-3 text-violet-500" /> Suggested Responses for Unresponded Negatives</p>
                            <div className="space-y-3">
                                {actions.suggestedResponses.slice(0, 5).map((sr: any, i: number) => (
                                    <div key={i} className="border border-gray-200 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-gray-700">{sr.reviewerName}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sr.sentiment === 'NEGATIVE' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{sr.sentiment || 'N/A'}</span>
                                            </div>
                                            <span className="text-xs text-red-500">{'★'.repeat(sr.rating)}{'☆'.repeat(5 - sr.rating)}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 italic mb-2">&ldquo;{sr.reviewText}&rdquo;</p>
                                        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                                            <p className="text-[10px] font-semibold text-emerald-700 mb-1 flex items-center gap-1"><PenTool className="w-2.5 h-2.5" /> Suggested Reply:</p>
                                            <p className="text-xs text-emerald-800">{sr.suggestedResponse}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {/* ==================== ALL REVIEWS ==================== */}
            <Section title={`All Reviews (${data.reviews?.length || 0})`} icon={<MessageSquareText className="w-4 h-4 text-gray-500" />}>
                {/* Search & Filter Bar */}
                <div className="flex flex-wrap gap-3 mb-4">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search reviews by text, reviewer name, or response..."
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                        />
                    </div>

                    {/* Rating Filter */}
                    <div className="flex gap-1">
                        {[null, 5, 4, 3, 2, 1].map((r) => (
                            <button
                                key={r ?? 'all'}
                                onClick={() => setRatingFilter(r)}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${ratingFilter === r
                                    ? 'bg-violet-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {r === null ? 'All' : `${r}★`}
                            </button>
                        ))}
                    </div>

                    {/* Sentiment Filter */}
                    <div className="flex gap-1">
                        {[null, 'POSITIVE', 'NEGATIVE', 'NEUTRAL'].map((s) => (
                            <button
                                key={s ?? 'all-s'}
                                onClick={() => setSentimentFilter(s)}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${sentimentFilter === s
                                    ? 'bg-violet-600 text-white'
                                    : s === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
                                        s === 'NEGATIVE' ? 'bg-red-50 text-red-600 hover:bg-red-100' :
                                            s === 'NEUTRAL' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' :
                                                'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {s === null ? 'All' : s === 'POSITIVE' ? '😊' : s === 'NEGATIVE' ? '😠' : '😐'}
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                    Showing {filteredReviews.length} of {data.reviews?.length || 0} reviews
                    {searchQuery && ` matching "${searchQuery}"`}
                </p>

                {/* Review Cards */}
                <div className="space-y-3">
                    {(showAllReviews ? filteredReviews : filteredReviews.slice(0, 20)).map((r: any) => (
                        <div key={r.id} className={`border rounded-xl p-4 transition-colors ${r.isLikelyFake ? 'border-red-300 bg-red-50/30 ring-1 ring-red-200' : 'border-gray-200 hover:border-gray-300'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-gray-100 text-gray-500">
                                        {r.reviewerName?.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="font-bold text-gray-800 text-sm">{r.reviewerName}</h4>
                                            <span className="text-amber-400 text-xs">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                            {r.reviewCount ? <span>{r.reviewCount} reviews</span> : null}
                                            {r.photoCount ? <span>• {r.photoCount} photos</span> : null}
                                            {r.publishedDate ? <span>• {r.publishedDate}</span> : null}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.sentimentLabel === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' :
                                        r.sentimentLabel === 'NEGATIVE' ? 'bg-red-100 text-red-700' :
                                            r.sentimentLabel === 'MIXED' ? 'bg-amber-100 text-amber-700' :
                                                'bg-gray-100 text-gray-600'
                                        }`}>{r.sentimentLabel || 'N/A'}</span>
                                    {r.isLikelyFake && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-0.5"><Flag className="w-2.5 h-2.5" /> FLAGGED</span>}
                                </div>
                            </div>

                            {/* Review Text */}
                            {r.text ? (
                                <p className="text-sm text-gray-700 leading-relaxed">{r.text}</p>
                            ) : (
                                <p className="text-xs text-gray-400 italic">Rating only — no text</p>
                            )}

                            {/* Review Image */}
                            {r.reviewImage && (
                                <div className="mt-3">
                                    <img src={r.reviewImage} alt="Review attachment" className="h-20 w-auto rounded-md border border-gray-200 object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(r.reviewImage, '_blank')} />
                                </div>
                            )}

                            {/* Fake Review Details */}
                            {r.isLikelyFake && (
                                <div className="mt-2 bg-red-50 rounded-lg p-3 border border-red-200">
                                    <p className="text-[10px] font-bold text-red-700 mb-1 flex items-center gap-1"><Flag className="w-3 h-3" /> Why this review is flagged (Fake Score: {r.fakeScore}/100)</p>
                                    <ul className="space-y-0.5">
                                        {(() => {
                                            const reasons: string[] = [];
                                            if (!r.text || r.text.length < 20) reasons.push('No or minimal review text');
                                            if (r.reviewCount !== undefined && r.reviewCount <= 1) reasons.push('Single-review account (first/only review on Google)');
                                            if (!r.photoCount || r.photoCount === 0) reasons.push('Reviewer has never uploaded any photos');
                                            if ((r.rating === 1 || r.rating === 5) && (!r.text || r.text.length < 30)) reasons.push('Extreme rating with minimal supporting text');
                                            if (reasons.length === 0) reasons.push('Multiple risk signals detected');
                                            return reasons.map((reason, idx) => (
                                                <li key={idx} className="text-[10px] text-red-600">• {reason}</li>
                                            ));
                                        })()}
                                    </ul>
                                </div>
                            )}

                            {/* Owner Response */}
                            {r.responseText && (
                                <div className="mt-3 bg-blue-50 rounded-lg p-3 border-l-3 border-blue-400">
                                    <p className="text-[10px] font-bold text-blue-700 mb-1 flex items-center gap-1"><MessageCircle className="w-2.5 h-2.5" /> Owner Response {r.responseDate ? `• ${r.responseDate}` : ''}</p>
                                    <p className="text-xs text-blue-800">{r.responseText}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Show More */}
                {filteredReviews.length > 20 && !showAllReviews && (
                    <button
                        onClick={() => setShowAllReviews(true)}
                        className="w-full mt-4 py-3 bg-gray-50 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                    >
                        <ChevronDown className="w-4 h-4" />
                        Show All {filteredReviews.length} Reviews
                    </button>
                )}
                {showAllReviews && filteredReviews.length > 20 && (
                    <button
                        onClick={() => setShowAllReviews(false)}
                        className="w-full mt-4 py-3 bg-gray-50 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                    >
                        <ChevronUp className="w-4 h-4" />
                        Show Less
                    </button>
                )}
            </Section>

            {/* Floating Rerun Terminal Widget */}
            {showRerunTerminal && (
                <div className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${rerunTerminalCollapsed ? 'w-64' : 'w-[380px] sm:w-[450px]'} pointer-events-none`}>
                    <div className="bg-[#1e1e1e] rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex flex-col max-h-[500px] pointer-events-auto">
                        <div className="bg-[#2d2d2d] px-4 py-3 flex items-center justify-between shrink-0 border-b border-white/5 cursor-pointer" onClick={() => setRerunTerminalCollapsed(!rerunTerminalCollapsed)}>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/30" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/30" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/30" />
                                </div>
                                <span className="ml-2 text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                                    {rerunTerminalCollapsed ? 'Rerun Paused' : 'Rerun Console'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {rerunning && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                                <button className="p-1 hover:bg-white/10 rounded transition-colors">
                                    {rerunTerminalCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                </button>
                            </div>
                        </div>
                        {!rerunTerminalCollapsed && (
                            <div className="p-4 overflow-y-auto font-mono text-[11px] space-y-1.5 flex-1 bg-black/40 backdrop-blur-md h-[300px]">
                                {rerunLogs.map((log, i) => (
                                    <div key={i} className={`flex items-start gap-2 ${log.type === 'error' ? 'text-red-400' :
                                        log.type === 'success' ? 'text-green-400' :
                                            log.msg.includes('Loaded') ? 'text-blue-300' : 'text-gray-300'
                                        }`}>
                                        <span className="opacity-30 select-none whitespace-nowrap">{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                        <span className="break-all">{log.msg}</span>
                                    </div>
                                ))}
                                {rerunning && (
                                    <div className="text-gray-500 animate-pulse flex items-center gap-1">
                                        <span className="w-1.5 h-3 bg-gray-500" />
                                    </div>
                                )}
                                <div id="rerun-terminal-end" />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ HELPER COMPONENTS ============

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-gray-50">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center">{icon}</span>
                    {title}
                </h2>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

function StatCard({ label, value, color = 'blue', icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
    const colors: Record<string, string> = {
        blue: 'bg-blue-50/80 text-blue-700 border-blue-100',
        green: 'bg-emerald-50/80 text-emerald-700 border-emerald-100',
        red: 'bg-red-50/80 text-red-700 border-red-100',
        amber: 'bg-amber-50/80 text-amber-700 border-amber-100',
        violet: 'bg-violet-50/80 text-violet-700 border-violet-100',
        gray: 'bg-gray-50/80 text-gray-700 border-gray-100',
    };
    return (
        <div className={`rounded-xl p-3 border ${colors[color] || colors.blue} transition-all hover:shadow-sm`}>
            <div className="flex items-center gap-1.5 mb-1">
                {icon && <span className="opacity-60">{icon}</span>}
                <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">{label}</p>
            </div>
            <p className="text-lg font-bold">{value}</p>
        </div>
    );
}

function SourceReviews({ reviews, label }: { reviews: any[]; label?: string }) {
    const [open, setOpen] = useState(false);
    if (!reviews?.length) return null;
    return (
        <div className="mt-2">
            <button
                onClick={() => setOpen(!open)}
                className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1 transition-colors"
            >
                <Eye className="w-3 h-3" />
                {open ? 'Hide' : 'View'} {reviews.length} source review{reviews.length !== 1 ? 's' : ''}
                {label ? ` (${label})` : ''}
                {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {open && (
                <div className="mt-2 max-h-64 overflow-y-auto space-y-2 border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                    {reviews.map((r: any, i: number) => (
                        <div key={i} className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                {r.reviewerUrl ? (
                                    <a href={r.reviewerUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 hover:underline">
                                        {r.reviewerName}
                                    </a>
                                ) : (
                                    <span className="text-xs font-semibold text-gray-800">{r.reviewerName}</span>
                                )}
                                <span className="text-amber-400 text-[10px]">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                                {r.sentimentLabel && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${r.sentimentLabel === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' :
                                        r.sentimentLabel === 'NEGATIVE' ? 'bg-red-100 text-red-700' :
                                            'bg-gray-100 text-gray-600'
                                        }`}>{r.sentimentLabel}</span>
                                )}
                                {r.reviewImage && (
                                    <span className="text-[9px] text-blue-600 font-semibold flex items-center gap-0.5">
                                        <ImageIcon className="w-2 h-2" /> Has Photo
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-600 line-clamp-3">{r.text || '(No text)'}</p>
                            {r.reviewImage && (
                                <div className="mt-2 mb-1">
                                    <img src={r.reviewImage} alt="Review attachment" className="h-16 w-auto rounded-md border border-gray-200 object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(r.reviewImage, '_blank')} />
                                </div>
                            )}
                            {r.publishedDate && <p className="text-[9px] text-gray-400 mt-1">{r.publishedDate}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
