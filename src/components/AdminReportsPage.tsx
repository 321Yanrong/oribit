import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronLeft, FaCheck, FaTimes, FaFilter, FaSpinner } from 'react-icons/fa';
import { supabase } from '../api/supabase';
import { useScrollLock } from '../hooks/useScrollLock';

interface AdminReportsPageProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
}

interface ReportItem {
    id: string;
    reporter_id: string;
    reported_user_id: string;
    reason: string;
    evidence_url?: string;
    status: 'pending' | 'resolved' | 'dismissed';
    created_at: string;
    reporter?: { username: string; email: string };
    reported?: { username: string; email: string };
}

const AdminReportsPage = ({ isOpen, onClose, isDarkMode }: AdminReportsPageProps) => {
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');
    const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

    useScrollLock(isOpen);

    useEffect(() => {
        if (isOpen) {
            fetchReports();
        }
    }, [isOpen]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            // 1. Fetch reports
            const { data, error } = await supabase
                .from('reports' as any)
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 2. Enrich with user data (manually since relation might be complex or RLS sensitive)
            // Note: In a real admin app, you'd use a join query or a View.
            // We'll try to fetch basic requester info if possible
            const enriched = await Promise.all((data || []).map(async (r: any) => {
                // Fetch reporter name
                const { data: reporterData } = await supabase.from('profiles').select('username, email').eq('id', r.reporter_id).single();
                // Fetch reported user name
                const { data: reportedData } = await supabase.from('profiles').select('username, email').eq('id', r.reported_user_id).single();

                return {
                    ...r,
                    reporter: reporterData || { username: 'Unknown', email: '---' },
                    reported: reportedData || { username: 'Unknown', email: '---' }
                };
            }));

            setReports(enriched);
        } catch (err) {
            console.error('Failed to fetch reports:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id: string, newStatus: 'resolved' | 'dismissed') => {
        try {
            const { error } = await supabase
                .from('reports' as any)
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
            setSelectedReport(null);
        } catch (err) {
            console.error('Failed to update status:', err);
            alert('操作失败，请检查您的权限');
        }
    };

    if (!isOpen) return null;

    const filteredReports = reports.filter(r => filter === 'all' || r.status === filter);

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-0 z-[100] overflow-hidden flex flex-col"
            style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7', color: isDarkMode ? '#e5e7eb' : '#000000' }}
        >
            {/* Header */}
            <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-between border-b"
                style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}>
                <button onClick={onClose} className="p-2">
                    <FaChevronLeft />
                </button>
                <span className="font-bold text-lg">举报管理 (Admin)</span>
                <div className="w-8" />
            </div>

            {/* Filter Tabs */}
            <div className="flex p-2 gap-2 border-b" style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}>
                {['all', 'pending', 'resolved'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f as any)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f
                            ? 'bg-blue-500 text-white'
                            : isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600'
                            }`}
                    >
                        {f === 'all' ? '全部' : f === 'pending' ? '待处理' : '已解决'}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="flex justify-center pt-20"><FaSpinner className="animate-spin text-2xl" /></div>
                ) : filteredReports.length === 0 ? (
                    <div className="text-center pt-20 opacity-50">暂无相关举报</div>
                ) : (
                    filteredReports.map(report => (
                        <div
                            key={report.id}
                            className="p-4 rounded-xl border relative"
                            style={{ background: isDarkMode ? '#111827' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb' }}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-xs px-2 py-0.5 rounded ${report.status === 'pending' ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'
                                    }`}>
                                    {report.status.toUpperCase()}
                                </span>
                                <span className="text-xs opacity-50">{new Date(report.created_at).toLocaleString()}</span>
                            </div>

                            <div className="text-sm space-y-1 mb-3">
                                <p><span className="opacity-60">举报人:</span> {report.reporter?.username}</p>
                                <p><span className="opacity-60">被举报:</span> {report.reported?.username}</p>
                                <p className="font-medium mt-2 p-2 rounded bg-opacity-10 bg-gray-500">
                                    {report.reason}
                                </p>
                            </div>

                            {report.evidence_url && (
                                <div className="mb-3">
                                    <p className="text-xs opacity-60 mb-1">证据截图:</p>
                                    <img src={report.evidence_url} alt="Proof" className="w-20 h-20 object-cover rounded bg-black/20"
                                        onClick={() => window.open(report.evidence_url, '_blank')} />
                                </div>
                            )}

                            {report.status === 'pending' && (
                                <div className="flex gap-2 justify-end mt-2 pt-2 border-t" style={{ borderColor: isDarkMode ? '#374151' : '#f3f4f6' }}>
                                    <button
                                        onClick={() => handleUpdateStatus(report.id, 'dismissed')}
                                        className="px-3 py-1.5 text-xs rounded border border-gray-500 opacity-70"
                                    >
                                        忽略
                                    </button>
                                    <button
                                        onClick={() => handleUpdateStatus(report.id, 'resolved')}
                                        className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white"
                                    >
                                        标记已解决
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </motion.div>
    );
};

export default AdminReportsPage;
