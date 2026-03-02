'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    MessageSquareText, Plus, Search, Star, Clock, AlertTriangle,
    CheckCircle, Trash2, ExternalLink, Loader2, MapPin, Building2, X, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';

interface ReviewAnalysisSummary {
    id: string;
    businessName: string;
    businessUrl: string;
    totalReviews: number;
    averageRating: number;
    status: string;
    error?: string;
    createdAt: string;
}

interface BusinessPreview {
    name: string;
    averageRating: number;
    totalReviews: number;
    placeId?: string;
    address?: string;
    category?: string;
}

export default function ReviewsPage() {
    const [analyses, setAnalyses] = useState<ReviewAnalysisSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [url, setUrl] = useState('');
    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState<BusinessPreview | null>(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'error' | 'success' }[]>([]);
    const [showTerminal, setShowTerminal] = useState(false);
    const [terminalCollapsed, setTerminalCollapsed] = useState(false);

    useEffect(() => {
        fetchAnalyses();
        const interval = setInterval(fetchAnalyses, 5000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll terminal
    useEffect(() => {
        const el = document.getElementById('terminal-end');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    async function fetchAnalyses() {
        try {
            const res = await fetch('/api/reviews');
            const data = await res.json();
            setAnalyses(Array.isArray(data) ? data : []);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }

    async function previewBusiness() {
        if (!url.trim()) return;
        setPreviewing(true);
        setError('');
        setPreview(null);

        try {
            const res = await fetch('/api/reviews/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to preview business');
            }

            if (!data.name || data.name === 'Unknown Business') {
                throw new Error('Could not find a business at this URL. Please check the link and try again.');
            }

            setPreview(data);
            setPreviewUrl(url.trim());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPreviewing(false);
        }
    }

    async function confirmAndStartAnalysis() {
        if (!preview || !previewUrl) return;
        setSubmitting(true);
        setError('');
        setLogs([]);
        setShowTerminal(true);
        setTerminalCollapsed(false);

        // Close the modal immediately — terminal takes over
        const savedUrl = previewUrl;
        const savedPreview = { ...preview };
        setPreview(null);
        setPreviewUrl('');
        setUrl('');

        try {
            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: savedUrl,
                    businessName: savedPreview.name,
                    totalReviews: savedPreview.totalReviews,
                    averageRating: savedPreview.averageRating,
                    placeId: savedPreview.placeId,
                }),
            });

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
                            const data = JSON.parse(line.slice(6));
                            if (data.msg) {
                                setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
                            }
                            if (data.type === 'complete') {
                                // Analysis done
                            }
                        } catch { /* ignore parse errors */ }
                    }
                }
            }

            setSubmitting(false);

            // Keep terminal open for a moment to show success, then refresh list
            setTimeout(() => {
                setShowTerminal(false);
                fetchAnalyses();
            }, 2000);

        } catch (err: any) {
            setError(err.message);
            setLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
            setSubmitting(false);
        }
    }

    async function deleteAnalysis(id: string) {
        if (!confirm('Delete this analysis?')) return;
        await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
        fetchAnalyses();
    }

    async function rerunAnalysis(id: string, businessName: string) {
        if (!confirm(`Rerun analysis for "${businessName}"? This will scrape fresh reviews.`)) return;
        setSubmitting(true);
        setLogs([]);
        setShowTerminal(true);
        setTerminalCollapsed(false);

        try {
            const res = await fetch(`/api/reviews/${id}/rerun`, { method: 'POST' });
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
                            const data = JSON.parse(line.slice(6));
                            if (data.msg) {
                                setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
                            }
                        } catch { /* ignore */ }
                    }
                }
            }

            setSubmitting(false);
            setTimeout(() => {
                setShowTerminal(false);
                fetchAnalyses();
            }, 2000);
        } catch (err: any) {
            setLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
            setSubmitting(false);
        }
    }

    const statusIcon = (status: string) => {
        switch (status) {
            case 'SCRAPING': return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
            case 'ANALYZING': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
            case 'COMPLETED': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
            case 'FAILED': return <AlertTriangle className="w-4 h-4 text-red-500" />;
            default: return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };

    const statusLabel = (status: string) => {
        switch (status) {
            case 'SCRAPING': return 'Scraping Reviews...';
            case 'ANALYZING': return 'Analyzing...';
            case 'COMPLETED': return 'Completed';
            case 'FAILED': return 'Failed';
            default: return 'Pending';
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
                        <MessageSquareText className="w-5 h-5 text-white" />
                    </div>
                    Review Intelligence
                </h1>
                <p className="text-gray-500 mt-1 text-sm">Deep analysis of Google reviews across 100+ data points</p>
            </div>

            {/* URL Input */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Analyze a Business</h2>
                <p className="text-xs text-gray-500 mb-4">
                    Paste a Google Maps business URL to preview and confirm the business before starting analysis.
                </p>
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && previewBusiness()}
                            placeholder="https://www.google.com/maps/place/..."
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-gray-50"
                            disabled={previewing}
                        />
                    </div>
                    <button
                        onClick={previewBusiness}
                        disabled={previewing || !url.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-violet-200 transition-all"
                    >
                        {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {previewing ? 'Looking up...' : 'Look Up'}
                    </button>
                </div>
                {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            </div>

            {/* ===== CONFIRMATION MODAL ===== */}
            {preview && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-5 text-white flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold">Confirm Business</h3>
                                <p className="text-violet-200 text-xs">Is this the right business?</p>
                            </div>
                            <button
                                onClick={() => { setPreview(null); setPreviewUrl(''); }}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Business Card */}
                        <div className="p-6 space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                                    <Building2 className="w-7 h-7 text-violet-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-lg font-bold text-gray-900">{preview.name}</h4>
                                    {preview.category && (
                                        <p className="text-xs text-gray-500 mt-0.5">{preview.category}</p>
                                    )}
                                    {preview.address && (
                                        <p className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                            <MapPin className="w-3 h-3" /> {preview.address}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-amber-50 rounded-xl p-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                        <span className="text-xl font-bold text-amber-700">{preview.averageRating}</span>
                                    </div>
                                    <p className="text-[10px] text-amber-600 mt-0.5">Avg Rating</p>
                                </div>
                                <div className="bg-violet-50 rounded-xl p-3 text-center">
                                    <span className="text-xl font-bold text-violet-700">{preview.totalReviews.toLocaleString()}</span>
                                    <p className="text-[10px] text-violet-600 mt-0.5">Total Reviews</p>
                                </div>
                                <div className="bg-blue-50 rounded-xl p-3 text-center">
                                    <span className="text-xl font-bold text-blue-700">103</span>
                                    <p className="text-[10px] text-blue-600 mt-0.5">Metrics</p>
                                </div>
                            </div>

                            {/* Estimate */}
                            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                                <span>
                                    Estimated time: ~{Math.max(1, Math.ceil(preview.totalReviews / 50))} min
                                    {preview.totalReviews > 200 ? ' (large business — the scraper will load all reviews)' : ''}
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setPreview(null); setPreviewUrl(''); }}
                                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmAndStartAnalysis}
                                    disabled={submitting}
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm shadow-violet-200 transition-all"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    {submitting ? 'Starting...' : 'Start Full Analysis'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Analyses List */}
            <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Analysis History</h2>

                {loading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
                    </div>
                ) : analyses.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                        <MessageSquareText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No analyses yet. Paste a Google Maps URL above to get started.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {analyses.map((a) => (
                            <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        {/* Status */}
                                        <div className="flex items-center gap-2 min-w-[140px]">
                                            {statusIcon(a.status)}
                                            <span className="text-xs font-medium text-gray-600">{statusLabel(a.status)}</span>
                                        </div>

                                        {/* Business info */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-semibold text-gray-900 truncate">{a.businessName}</h3>
                                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                                {a.status === 'COMPLETED' && (
                                                    <>
                                                        <span className="flex items-center gap-1">
                                                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                                            {a.averageRating.toFixed(1)}
                                                        </span>
                                                        <span>{a.totalReviews} reviews</span>
                                                    </>
                                                )}
                                                <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {a.status === 'COMPLETED' && (
                                            <>
                                                <Link href={`/reviews/${a.id}`}>
                                                    <button className="px-4 py-2 bg-violet-50 text-violet-600 rounded-lg text-xs font-semibold hover:bg-violet-100 transition-colors flex items-center gap-1.5">
                                                        <ExternalLink className="w-3 h-3" />
                                                        View Report
                                                    </button>
                                                </Link>
                                                <button
                                                    onClick={() => rerunAnalysis(a.id, a.businessName)}
                                                    disabled={submitting}
                                                    className="p-2 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                    title="Rerun analysis"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        {a.status === 'FAILED' && (
                                            <>
                                                <span className="text-xs text-red-500 max-w-[200px] truncate">{a.error}</span>
                                                <button
                                                    onClick={() => rerunAnalysis(a.id, a.businessName)}
                                                    disabled={submitting}
                                                    className="px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
                                                    title="Retry analysis"
                                                >
                                                    <RefreshCw className="w-3 h-3" /> Retry
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => deleteAnalysis(a.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Floating Terminal Widget */}
            {showTerminal && (
                <div className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${terminalCollapsed ? 'w-64' : 'w-[380px] sm:w-[450px]'} pointer-events-none`}>
                    <div className="bg-[#1e1e1e] rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex flex-col max-h-[500px] pointer-events-auto">
                        {/* Terminal Header */}
                        <div className="bg-[#2d2d2d] px-4 py-3 flex items-center justify-between shrink-0 border-b border-white/5 cursor-pointer" onClick={() => setTerminalCollapsed(!terminalCollapsed)}>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/30" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/30" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/30" />
                                </div>
                                <span className="ml-2 text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                                    {terminalCollapsed ? 'Scraper Paused' : 'Scraper Console'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {submitting && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                                <button className="p-1 hover:bg-white/10 rounded transition-colors">
                                    {terminalCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                </button>
                            </div>
                        </div>

                        {/* Terminal Body */}
                        {!terminalCollapsed && (
                            <div className="p-4 overflow-y-auto font-mono text-[11px] space-y-1.5 flex-1 bg-black/40 backdrop-blur-md h-[300px]" >
                                {logs.map((log, i) => (
                                    <div key={i} className={`flex items-start gap-2 ${log.type === 'error' ? 'text-red-400' :
                                        log.type === 'success' ? 'text-green-400' :
                                            log.msg.includes('Loaded') ? 'text-blue-300' : 'text-gray-300'
                                        }`}>
                                        <span className="opacity-30 select-none whitespace-nowrap">{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                        <span className="break-all">{log.msg}</span>
                                    </div>
                                ))}
                                {submitting && (
                                    <div className="text-gray-500 animate-pulse flex items-center gap-1">
                                        <span className="w-1.5 h-3 bg-gray-500" />
                                    </div>
                                )}
                                <div id="terminal-end" />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
