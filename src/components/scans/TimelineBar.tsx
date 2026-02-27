'use client';

import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';

interface Run {
    runId: string;
    runAt: string;
    resultCount: number;
}

interface TimelineBarProps {
    runs: Run[];
    activeRunId: string | null;
    onSelectRun: (runId: string) => void;
}

export function TimelineBar({ runs, activeRunId, onSelectRun }: TimelineBarProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    if (runs.length <= 1) return null; // Don't show for single-run scans

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -200 : 200,
                behavior: 'smooth'
            });
        }
    };

    const formatRunDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);

        if (diffHrs < 1) return 'Just now';
        if (diffHrs < 24) return `${Math.round(diffHrs)}h ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const formatRunLabel = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/50">
                <Clock size={14} className="text-blue-600" />
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Scan Timeline</span>
                <span className="text-[10px] font-medium text-gray-400 ml-auto">{runs.length} runs</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-2">
                {runs.length > 4 && (
                    <button
                        onClick={() => scroll('left')}
                        className="shrink-0 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    >
                        <ChevronLeft size={12} className="text-gray-500" />
                    </button>
                )}

                <div
                    ref={scrollRef}
                    className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1"
                >
                    {runs.map((run, idx) => {
                        const isActive = run.runId === activeRunId;
                        const isLatest = idx === runs.length - 1;

                        return (
                            <button
                                key={run.runId}
                                onClick={() => onSelectRun(run.runId)}
                                className={`
                                    shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg
                                    transition-all text-center min-w-[80px] relative
                                    ${isActive
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'
                                    }
                                `}
                            >
                                {isLatest && (
                                    <span className={`absolute -top-1.5 right-1 text-[7px] font-black uppercase tracking-widest px-1 py-0 rounded ${isActive ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-600'}`}>
                                        Latest
                                    </span>
                                )}
                                <span className="text-[10px] font-bold leading-tight">
                                    {formatRunLabel(run.runAt)}
                                </span>
                                <span className={`text-[9px] leading-tight ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>
                                    {formatRunDate(run.runAt)}
                                </span>
                                <span className={`text-[8px] font-medium ${isActive ? 'text-blue-200' : 'text-gray-300'}`}>
                                    {run.resultCount} pts
                                </span>
                            </button>
                        );
                    })}
                </div>

                {runs.length > 4 && (
                    <button
                        onClick={() => scroll('right')}
                        className="shrink-0 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    >
                        <ChevronRight size={12} className="text-gray-500" />
                    </button>
                )}
            </div>
        </div>
    );
}
