'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, X, Info, RefreshCw, CheckCircle, AlertTriangle, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui';

const GITHUB_PKG_URL = 'https://raw.githubusercontent.com/danishfareed/Google-Maps-SERP/main/package.json';
const GITHUB_RELEASES_URL = 'https://raw.githubusercontent.com/danishfareed/Google-Maps-SERP/main/public/releases.json';

export function UpdateNotifier() {
    const [currentVersion, setCurrentVersion] = useState('');
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [latestVersion, setLatestVersion] = useState('');
    const [dismissed, setDismissed] = useState(false);
    const [showChanges, setShowChanges] = useState(false);
    const [releases, setReleases] = useState<any[]>([]);

    // Update state
    const [updating, setUpdating] = useState(false);
    const [updateDone, setUpdateDone] = useState(false);
    const [updateError, setUpdateError] = useState('');
    const [updateLogs, setUpdateLogs] = useState<string[]>([]);
    const [showLogs, setShowLogs] = useState(false);

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                // Get current local version dynamically from our API
                const localRes = await fetch('/api/system/update');
                const localPkg = await localRes.json();
                const local = localPkg.version || '0.0.0';
                setCurrentVersion(local);

                // Check GitHub for latest version
                const res = await fetch(GITHUB_PKG_URL);
                if (!res.ok) return;
                const remotePkg = await res.json();
                const remote = remotePkg.version;

                if (remote && remote !== local) {
                    setLatestVersion(remote);
                    setUpdateAvailable(true);

                    // Fetch remote release notes
                    try {
                        const relRes = await fetch(GITHUB_RELEASES_URL);
                        if (relRes.ok) setReleases(await relRes.json());
                    } catch { /* ignore */ }
                }
            } catch (err) {
                console.error('Failed to check for updates:', err);
            }
        };

        checkUpdate();
    }, []);

    const handleUpdate = async () => {
        setUpdating(true);
        setUpdateError('');
        setUpdateLogs([]);
        try {
            const res = await fetch('/api/system/update', { method: 'POST' });
            const data = await res.json();
            setUpdateLogs(data.logs || []);
            if (data.success) {
                setUpdateDone(true);
            } else {
                setUpdateError(data.error || 'Update failed');
            }
        } catch (err: any) {
            setUpdateError(err.message);
        } finally {
            setUpdating(false);
        }
    };

    if (!updateAvailable || dismissed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full"
            >
                <div className="bg-white border-2 border-blue-600 rounded-2xl shadow-2xl p-4 overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />

                    <button
                        onClick={() => setDismissed(true)}
                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1"
                    >
                        <X size={16} />
                    </button>

                    <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${updateDone ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                            {updateDone ? <CheckCircle size={20} /> : <Sparkles size={20} />}
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                                {updateDone ? 'Update Complete!' : 'Update Available'}
                            </h4>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                                {updateDone
                                    ? `Updated to v${latestVersion}. Restart the app to apply.`
                                    : `v${latestVersion} is available. You're on v${currentVersion}.`
                                }
                            </p>

                            {updateError && (
                                <div className="mt-2 flex items-start gap-1.5 bg-red-50 rounded-lg p-2">
                                    <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-red-600 font-medium">{updateError}</p>
                                </div>
                            )}

                            {!updateDone && (
                                <div className="flex items-center gap-3 mt-4">
                                    <Button
                                        size="sm"
                                        className={`h-8 px-4 text-[10px] font-black uppercase tracking-widest ${updating ? 'bg-gray-400' : 'bg-blue-600'}`}
                                        onClick={handleUpdate}
                                        disabled={updating}
                                    >
                                        {updating ? (
                                            <>
                                                <RefreshCw size={12} className="mr-1 animate-spin" />
                                                Updating...
                                            </>
                                        ) : (
                                            <>
                                                Get Update <ArrowRight size={12} className="ml-1" />
                                            </>
                                        )}
                                    </Button>
                                    <button
                                        onClick={() => setShowChanges(!showChanges)}
                                        className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
                                    >
                                        {showChanges ? 'Close' : 'View Changes'}
                                    </button>
                                </div>
                            )}

                            {(updating || updateLogs.length > 0) && (
                                <div className="mt-3">
                                    <button
                                        onClick={() => setShowLogs(!showLogs)}
                                        className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 flex items-center gap-1"
                                    >
                                        <Terminal size={10} />
                                        {showLogs ? 'Hide' : 'Show'} Logs
                                    </button>
                                    <AnimatePresence>
                                        {showLogs && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="mt-2 bg-gray-900 rounded-lg p-2 max-h-32 overflow-y-auto"
                                            >
                                                {updateLogs.map((log, i) => (
                                                    <p key={i} className="text-[9px] text-gray-300 font-mono leading-relaxed">{log}</p>
                                                ))}
                                                {updating && (
                                                    <p className="text-[9px] text-blue-400 font-mono animate-pulse">Running...</p>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Release notes */}
                    <AnimatePresence>
                        {showChanges && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mt-4 pt-4 border-t border-gray-100 overflow-hidden"
                            >
                                <div className="space-y-3">
                                    {releases.filter(r => r.version === latestVersion).map((rel, i) => (
                                        <div key={i}>
                                            <p className="text-[10px] font-black text-blue-600 uppercase mb-2 flex items-center gap-1">
                                                <Info size={10} /> {rel.title}
                                            </p>
                                            <ul className="space-y-1.5">
                                                {rel.changes.map((change: string, idx: number) => (
                                                    <li key={idx} className="text-[10px] text-gray-600 flex items-start">
                                                        <span className="mr-2 text-blue-400">•</span>
                                                        {change}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                    {releases.filter(r => r.version === latestVersion).length === 0 && (
                                        <p className="text-[10px] text-gray-400 italic">Check GitHub for release notes.</p>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
