import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaChevronLeft, FaChevronRight, FaSpinner, FaSearch, FaBan, FaCheck,
    FaBell, FaUsers, FaFlag, FaUser, FaTimes,
} from 'react-icons/fa';
import { supabase } from '../api/supabase';
import { useScrollLock } from '../hooks/useScrollLock';

/** 全屏遮罩盖住底栏时，仅需避开 Home 指示条，勿再用底栏高度留白 */
const ADMIN_SCROLL_BOTTOM_PAD = 'max(28px, calc(env(safe-area-inset-bottom, 0px) + 16px))';

interface AdminReportsPageProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface UserProfile {
    id: string;
    username: string;
    email: string;
    avatar_url?: string;
    is_banned: boolean;
    is_admin: boolean;
    storage_used?: number;
    storage_quota_bytes: number;
    created_at: string;
    last_login_at?: string | null;
    one_signal_player_id?: string;
}

type Tab = 'reports' | 'users' | 'notifications';
type NotifyMode = 'broadcast' | 'individual' | 'filter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576)    return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
};

const extractFunctionErrorMessage = async (error: any) => {
    const fallback = error?.message || '请求失败';
    const context = error?.context;
    if (!context) return fallback;

    let payload: any = null;
    let rawText = '';
    const responseLike = typeof context?.clone === 'function' ? context.clone() : context;

    if (responseLike && typeof responseLike.json === 'function') {
        try {
            payload = await responseLike.json();
        } catch {
            // ignore and try text fallback
        }
    }

    if (!payload && responseLike && typeof responseLike.text === 'function') {
        try {
            rawText = (await responseLike.text())?.trim?.() || '';
            if (rawText) {
                try {
                    payload = JSON.parse(rawText);
                } catch {
                    payload = rawText;
                }
            }
        } catch {
            // ignore
        }
    }

    const code = payload?.code || payload?.error_code;
    if (code === 'not_admin') return '当前账号没有管理员权限';
    if (code === 'bad_request') return payload?.error || payload?.message || '请求参数错误';
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload === 'string' && payload.trim()) return payload;
    if (rawText) return rawText;

    const status = context?.status;
    const statusText = context?.statusText;
    if (typeof status === 'number') {
        return statusText ? `请求失败 (${status} ${statusText})` : `请求失败 (${status})`;
    }
    return fallback;
};

const getValidToken = async (): Promise<string | null> => {
    // Always try to refresh first to get a fresh token
    try {
        const { data } = await supabase.auth.refreshSession();
        if (data?.session?.access_token) return data.session.access_token;
    } catch { /* ignore */ }
    // Fall back to current session
    try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) return data.session.access_token;
    } catch { /* ignore */ }
    return null;
};

const callAdminAction = async (body: Record<string, unknown>) => {
    const token = await getValidToken();
    if (!token) throw new Error('登录已过期，请重新登录后再试');

    // Explicitly pass the fresh token to avoid Capacitor iOS stale-token issue
    const { data, error } = await supabase.functions.invoke('admin-action', {
        body,
        headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
        const msg = await extractFunctionErrorMessage(error);
        throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
};

const callSendNotifications = async (body: Record<string, unknown>) => {
    const token = await getValidToken();
    if (!token) throw new Error('登录已过期，请重新登录后再试');

    console.log('[AdminNotify] request payload:', body);
    const { data, error } = await supabase.functions.invoke('send-notifications', {
        body,
        headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw new Error(await extractFunctionErrorMessage(error));
    if (data?.error) throw new Error(data.error);
    const skippedCount = Object.keys(data?.skipped ?? {}).length;
    const onesignalErrors = (data?.onesignal?.errors ?? data?.onesignal?.invalid_aliases ?? data?.onesignal?.warnings ?? null);
    console.log('[AdminNotify] response summary:', {
        sent: data?.sent ?? 0,
        skippedCount,
        total: data?.total ?? 0,
        onesignalId: data?.onesignal?.id ?? null,
        onesignalErrors,
    });
    return data;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Card = ({ children, isDark }: { children: React.ReactNode; isDark: boolean }) => (
    <div
        className="p-4 rounded-xl border"
        style={{
            background: isDark ? '#111827' : '#fff',
            borderColor: isDark ? '#374151' : '#e5e7eb',
        }}
    >
        {children}
    </div>
);

const Pill = ({ label, color }: { label: string; color: 'red' | 'green' | 'blue' | 'gray' }) => {
    const map = {
        red:   'bg-red-500/20 text-red-400',
        green: 'bg-green-500/20 text-green-400',
        blue:  'bg-blue-500/20 text-blue-400',
        gray:  'bg-gray-500/20 text-gray-400',
    };
    return <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[color]}`}>{label}</span>;
};

// ─── Tab: 举报管理 ─────────────────────────────────────────────────────────────

const ReportsTab = ({ isDark }: { isDark: boolean }) => {
    const [reports, setReports]     = useState<ReportItem[]>([]);
    const [loading, setLoading]     = useState(false);
    const [filter, setFilter]       = useState<'all' | 'pending' | 'resolved'>('pending');

    const fetchReports = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('reports' as any)
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;

            const enriched = await Promise.all((data || []).map(async (r: any) => {
                const { data: rep } = await supabase.from('profiles').select('username, email').eq('id', r.reporter_id).single();
                const { data: rpd } = await supabase.from('profiles').select('username, email').eq('id', r.reported_user_id).single();
                return {
                    ...r,
                    reporter: rep  || { username: 'Unknown', email: '---' },
                    reported: rpd  || { username: 'Unknown', email: '---' },
                };
            }));
            setReports(enriched);
        } catch (err) {
            console.error('fetchReports error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    const updateStatus = async (id: string, status: 'resolved' | 'dismissed') => {
        const { error } = await supabase.from('reports' as any).update({ status }).eq('id', id);
        if (error) { alert('操作失败'); return; }
        setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    };

    const visible = reports.filter(r => filter === 'all' || r.status === filter);

    return (
        <div
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{ paddingBottom: ADMIN_SCROLL_BOTTOM_PAD }}
        >
            {/* Filter row */}
            <div className="flex gap-2 flex-wrap">
                {(['all', 'pending', 'resolved'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            filter === f
                                ? 'bg-blue-500 text-white'
                                : isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600'
                        }`}
                    >
                        {f === 'all' ? '全部' : f === 'pending' ? '待处理' : '已解决'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center pt-20"><FaSpinner className="animate-spin text-2xl" /></div>
            ) : visible.length === 0 ? (
                <div className="text-center pt-20 opacity-50">暂无举报</div>
            ) : (
                visible.map(report => (
                    <Card key={report.id} isDark={isDark}>
                        <div className="flex justify-between items-start mb-2">
                            <Pill
                                label={report.status.toUpperCase()}
                                color={report.status === 'pending' ? 'red' : 'green'}
                            />
                            <span className="text-xs opacity-50">{new Date(report.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-sm space-y-1 mb-3">
                            <p><span className="opacity-60">举报人:</span> {report.reporter?.username}</p>
                            <p><span className="opacity-60">被举报:</span> {report.reported?.username}</p>
                            <p className="mt-2 p-2 rounded text-sm" style={{ background: isDark ? '#1f2937' : '#f3f4f6' }}>
                                {report.reason}
                            </p>
                        </div>
                        {report.evidence_url && (
                            <img
                                src={report.evidence_url} alt="证据"
                                className="w-20 h-20 object-cover rounded mb-3 cursor-pointer bg-black/20"
                                onClick={() => window.open(report.evidence_url, '_blank')}
                            />
                        )}
                        {report.status === 'pending' && (
                            <div className="flex gap-2 justify-end pt-2 border-t" style={{ borderColor: isDark ? '#374151' : '#f3f4f6' }}>
                                <button
                                    onClick={() => updateStatus(report.id, 'dismissed')}
                                    className="px-3 py-1.5 text-xs rounded border border-gray-500 opacity-70"
                                >
                                    忽略
                                </button>
                                <button
                                    onClick={() => updateStatus(report.id, 'resolved')}
                                    className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white"
                                >
                                    标记已解决
                                </button>
                            </div>
                        )}
                    </Card>
                ))
            )}
        </div>
    );
};

// ─── Tab: 用户管理 ─────────────────────────────────────────────────────────────

const UsersTab = ({ isDark }: { isDark: boolean }) => {
    const [query, setQuery]         = useState('');
    const [users, setUsers]         = useState<UserProfile[]>([]);
    const [loading, setLoading]     = useState(false);
    const [saving, setSaving]       = useState<string | null>(null);
    const [quotaEdit, setQuotaEdit] = useState<Record<string, string>>({});
    const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    const flash = (type: 'ok' | 'err', text: string) => {
        setMsg({ type, text });
        setTimeout(() => setMsg(null), 3000);
    };

    const loadAllUsers = useCallback(async () => {
        setLoading(true);
        try {
            const result = await callAdminAction({ action: 'list_users', limit: 100 });
            setUsers(result.users || []);
        } catch (e: any) {
            flash('err', e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAllUsers();
    }, [loadAllUsers]);

    const search = async () => {
        if (!query.trim()) {
            loadAllUsers();
            return;
        }
        setLoading(true);
        try {
            const result = await callAdminAction({ action: 'search_users', query: query.trim() });
            setUsers(result.users || []);
            if (!result.users?.length) flash('ok', '没有找到匹配用户');
        } catch (e: any) {
            flash('err', e.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleBan = async (user: UserProfile) => {
        setSaving(user.id);
        try {
            await callAdminAction({
                action: user.is_banned ? 'unban' : 'ban',
                user_id: user.id,
            });
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_banned: !u.is_banned } : u));
            flash('ok', user.is_banned ? '已解封' : '已封禁');
        } catch (e: any) {
            flash('err', e.message);
        } finally {
            setSaving(null);
        }
    };

    const saveQuota = async (user: UserProfile) => {
        const raw = quotaEdit[user.id];
        const mb  = parseFloat(raw);
        if (isNaN(mb) || mb < 0) { flash('err', '请输入有效的 MB 数'); return; }
        setSaving(user.id + '_quota');
        try {
            await callAdminAction({
                action: 'set_storage_quota',
                user_id: user.id,
                bytes: Math.round(mb * 1048576),
            });
            setUsers(prev => prev.map(u =>
                u.id === user.id ? { ...u, storage_quota_bytes: Math.round(mb * 1048576) } : u
            ));
            setQuotaEdit(prev => { const n = { ...prev }; delete n[user.id]; return n; });
            flash('ok', `已将配额更新为 ${mb} MB`);
        } catch (e: any) {
            flash('err', e.message);
        } finally {
            setSaving(null);
        }
    };

    return (
        <div
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{ paddingBottom: ADMIN_SCROLL_BOTTOM_PAD }}
        >
            {/* Search bar */}
            <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 rounded-xl border"
                    style={{ background: isDark ? '#1f2937' : '#f3f4f6', borderColor: isDark ? '#374151' : '#e5e7eb' }}>
                    <FaSearch className="opacity-40 shrink-0" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && search()}
                        placeholder="用户名 / 邮箱"
                        className="flex-1 bg-transparent outline-none py-2 text-sm"
                    />
                </div>
                <button
                    onClick={search}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
                >
                    {loading ? <FaSpinner className="animate-spin" /> : '搜索'}
                </button>
                <button
                    onClick={loadAllUsers}
                    disabled={loading}
                    className="px-3 py-2 rounded-xl bg-gray-500/20 text-sm font-medium disabled:opacity-50"
                >
                    全部
                </button>
            </div>

            {/* Flash message */}
            {msg && (
                <div className={`text-sm px-3 py-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {msg.text}
                </div>
            )}

            {/* User cards */}
            {users.map(user => (
                <Card key={user.id} isDark={isDark}>
                    <div className="flex items-center gap-3 mb-3">
                        {user.avatar_url
                            ? <img src={user.avatar_url} className="w-10 h-10 rounded-full object-cover" />
                            : <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-500/30">
                                <FaUser className="opacity-60" />
                              </div>
                        }
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{user.username}</p>
                            <p className="text-xs opacity-50 truncate">{user.email}</p>
                        </div>
                        <div className="flex gap-1 flex-wrap justify-end">
                            {user.is_admin  && <Pill label="管理员" color="blue" />}
                            {user.is_banned && <Pill label="已封禁" color="red"  />}
                        </div>
                    </div>

                    {/* Storage */}
                    <div className="text-xs opacity-60 mb-3 space-y-0.5">
                        <p>已用: {fmt(user.storage_used ?? 0)} / 配额: {fmt(user.storage_quota_bytes)}</p>
                        <p>注册: {new Date(user.created_at).toLocaleDateString()}</p>
                        <p>最近登录: {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '暂无记录'}</p>
                    </div>

                    {/* Quota editor */}
                    <div className="flex gap-2 mb-3 items-center">
                        <span className="text-xs opacity-60 shrink-0">调整配额 (MB):</span>
                        <input
                            type="number"
                            min="0"
                            value={quotaEdit[user.id] ?? String(Math.round(user.storage_quota_bytes / 1048576))}
                            onChange={e => setQuotaEdit(prev => ({ ...prev, [user.id]: e.target.value }))}
                            className="flex-1 text-sm px-2 py-1 rounded-lg border outline-none"
                            style={{ background: isDark ? '#1f2937' : '#f9fafb', borderColor: isDark ? '#374151' : '#d1d5db' }}
                        />
                        <button
                            onClick={() => saveQuota(user)}
                            disabled={saving === user.id + '_quota'}
                            className="px-3 py-1 text-xs rounded-lg bg-blue-500/20 text-blue-400 font-medium disabled:opacity-50"
                        >
                            {saving === user.id + '_quota' ? <FaSpinner className="animate-spin" /> : '保存'}
                        </button>
                    </div>

                    {/* Ban / Unban */}
                    <div className="flex justify-end">
                        <button
                            onClick={() => toggleBan(user)}
                            disabled={saving === user.id || user.is_admin}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${
                                user.is_banned
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                            }`}
                        >
                            {saving === user.id
                                ? <FaSpinner className="animate-spin" />
                                : user.is_banned
                                    ? <><FaCheck /> 解封</>
                                    : <><FaBan />  封禁</>
                            }
                        </button>
                    </div>
                </Card>
            ))}
        </div>
    );
};

// ─── Tab: 发送通知 ─────────────────────────────────────────────────────────────

const NotificationsTab = ({ isDark }: { isDark: boolean }) => {
    const [mode, setMode]         = useState<NotifyMode>('broadcast');
    const [title, setTitle]       = useState('');
    const [body, setBody]         = useState('');
    const [sending, setSending]   = useState(false);
    const [result, setResult]     = useState<string | null>(null);
    const [error, setError]       = useState<string | null>(null);

    // Individual mode
    const [userQuery, setUserQuery]   = useState('');
    const [userResults, setUserResults] = useState<UserProfile[]>([]);
    const [searching, setSearching]   = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    // Filter mode
    const [afterDate, setAfterDate]   = useState('');
    const [beforeDate, setBeforeDate] = useState('');
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [previewing, setPreviewing] = useState(false);

    const reset = () => { setResult(null); setError(null); };

    const searchUser = async () => {
        if (!userQuery.trim()) return;
        setSearching(true);
        try {
            const data = await callAdminAction({ action: 'search_users', query: userQuery.trim(), limit: 10 });
            setUserResults(data.users || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSearching(false);
        }
    };

    const previewFilter = async () => {
        setPreviewing(true);
        setPreviewCount(null);
        try {
            // Count matching users directly — do NOT call send-notifications (would send real pushes)
            let query = supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true });
            if (afterDate)  query = (query as any).gte('created_at', new Date(afterDate).toISOString());
            if (beforeDate) query = (query as any).lte('created_at', new Date(beforeDate + 'T23:59:59').toISOString());
            const { count, error } = await query;
            if (error) throw error;
            setPreviewCount(count ?? 0);
        } catch (e: any) {
            setPreviewCount(null);
        } finally {
            setPreviewing(false);
        }
    };

    const send = async () => {
        if (!title.trim() || !body.trim()) { setError('请填写标题和内容'); return; }
        setSending(true);
        reset();
        try {
            let payload: Record<string, unknown> = {
                headings: title,
                contents: body,
                type:     'general',
                data:     { type: 'announcement', title, body },
            };

            if (mode === 'broadcast') {
                payload.all_users = true;
            } else if (mode === 'individual') {
                if (!selectedUser) { setError('请先选择用户'); setSending(false); return; }
                payload.user_ids = [selectedUser.id];
            } else {
                const filter: Record<string, string> = {};
                if (afterDate)  filter.registered_after  = new Date(afterDate).toISOString();
                if (beforeDate) filter.registered_before = new Date(beforeDate + 'T23:59:59').toISOString();
                payload.filter = filter;
            }

            const data = await callSendNotifications(payload);
            setResult(`成功发送 ${data.sent} 条，跳过 ${Object.keys(data.skipped ?? {}).length} 条`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSending(false);
        }
    };

    // 深色：框内纯黑 + 白字；浅色：框内纯白 + 黑字
    const t = {
        canvas: isDark ? '#000000' : '#ffffff',
        frame: isDark ? '#000000' : '#ffffff',
        frameBorder: isDark ? '#333333' : '#e5e5e5',
        headerRule: isDark ? '#333333' : '#e5e5e5',
        text: isDark ? '#ffffff' : '#000000',
        muted: isDark ? '#d4d4d4' : '#404040',
        faint: isDark ? '#a3a3a3' : '#737373',
        section: isDark ? '#000000' : '#ffffff',
        sectionBorder: isDark ? '#333333' : '#e5e5e5',
        inputBg: isDark ? '#000000' : '#ffffff',
        inputBorder: isDark ? '#525252' : '#d4d4d4',
        chipInactiveBg: isDark ? '#000000' : '#ffffff',
        chipInactiveText: isDark ? '#ffffff' : '#000000',
        listHover: isDark ? '#1a1a1a' : '#f5f5f5',
        selectedRow: isDark ? '#000000' : '#ffffff',
        selectedRowBorder: isDark ? '#525252' : '#d4d4d4',
        successBg: isDark ? '#052e16' : '#ecfdf5',
        successText: isDark ? '#86efac' : '#065f46',
        errorBg: isDark ? '#450a0a' : '#fef2f2',
        errorText: isDark ? '#fca5a5' : '#991b1b',
        ctaBg: isDark ? '#ffffff' : '#000000',
        ctaText: isDark ? '#000000' : '#ffffff',
        iconTileBg: isDark ? '#000000' : '#ffffff',
        iconTileBorder: isDark ? '#333333' : '#e5e5e5',
    };

    const inputCls =
        `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-shadow focus:ring-2 ${isDark ? 'placeholder:text-neutral-500' : 'placeholder:text-neutral-400'}`;
    const inputClsFocus = isDark ? 'focus:ring-white/25' : 'focus:ring-black/15';

    const inputStyle: React.CSSProperties = {
        background: t.inputBg,
        borderColor: t.inputBorder,
        color: t.text,
    };

    const Section = ({
        title,
        children,
    }: {
        title: string;
        children: React.ReactNode;
    }) => (
        <div
            className="rounded-xl p-4"
            style={{
                background: t.section,
                border: `1px solid ${t.sectionBorder}`,
            }}
        >
            <p
                className="text-[11px] font-semibold uppercase tracking-wider mb-3"
                style={{ color: t.muted }}
            >
                {title}
            </p>
            {children}
        </div>
    );

    return (
        <div
            className="flex-1 overflow-y-auto px-3 py-4 sm:px-4"
            style={{
                background: t.canvas,
                color: t.text,
                paddingBottom: ADMIN_SCROLL_BOTTOM_PAD,
            }}
        >
            <div
                className="mx-auto max-w-lg rounded-2xl overflow-hidden"
                style={{
                    background: t.frame,
                    border: `1px solid ${t.frameBorder}`,
                    boxShadow: isDark
                        ? '0 20px 40px rgba(0,0,0,0.6)'
                        : '0 8px 32px rgba(0,0,0,0.06)',
                }}
            >
                {/* 顶部说明区 */}
                <div
                    className="px-5 pt-5 pb-4 flex gap-3.5 items-start"
                    style={{ borderBottom: `1px solid ${t.headerRule}` }}
                >
                    <div
                        className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-lg"
                        style={{
                            background: t.iconTileBg,
                            color: t.text,
                            border: `1px solid ${t.iconTileBorder}`,
                        }}
                    >
                        <FaBell />
                    </div>
                    <div className="min-w-0 pt-0.5">
                        <h2 className="text-base font-bold leading-tight" style={{ color: t.text }}>
                            推送通知
                        </h2>
                        <p className="text-sm mt-1 leading-snug" style={{ color: t.muted }}>
                            选择发送范围，填写标题与正文。用户可在系统设置中关闭推送。
                        </p>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* 范围 */}
                    <Section title="发送范围">
                        <div className="flex gap-2 flex-wrap">
                            {([
                                ['broadcast', '全体广播'],
                                ['individual', '单个用户'],
                                ['filter', '筛选发送'],
                            ] as [NotifyMode, string][]).map(([m, label]) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                        setMode(m);
                                        reset();
                                    }}
                                    className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
                                    style={
                                        mode === m
                                            ? {
                                                  background: t.ctaBg,
                                                  color: t.ctaText,
                                                  boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
                                              }
                                            : {
                                                  background: t.chipInactiveBg,
                                                  color: t.chipInactiveText,
                                                  border: `1px solid ${t.inputBorder}`,
                                              }
                                    }
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </Section>

                    {/* Individual */}
                    {mode === 'individual' && (
                        <Section title="接收用户">
                            <div className="flex gap-2 mb-2">
                                <input
                                    value={userQuery}
                                    onChange={(e) => setUserQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                                    placeholder="用户名 / 邮箱"
                                    className={`${inputCls} ${inputClsFocus} flex-1 min-w-0`}
                                    style={inputStyle}
                                />
                                <button
                                    type="button"
                                    onClick={searchUser}
                                    disabled={searching}
                                    className="shrink-0 px-3.5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-45 transition-opacity"
                                    style={{
                                        background: t.chipInactiveBg,
                                        color: t.text,
                                        border: `1px solid ${t.inputBorder}`,
                                    }}
                                >
                                    {searching ? <FaSpinner className="animate-spin" /> : <FaSearch />}
                                </button>
                            </div>
                            {selectedUser && (
                                <div
                                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-2 text-sm"
                                    style={{
                                        background: t.selectedRow,
                                        border: `1px solid ${t.selectedRowBorder}`,
                                        color: t.text,
                                    }}
                                >
                                    <FaUser className="shrink-0 opacity-80" />
                                    <span className="flex-1 truncate">
                                        {selectedUser.username} ({selectedUser.email})
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                        className="p-1 rounded-lg opacity-50 hover:opacity-100"
                                        style={{ color: t.text }}
                                    >
                                        <FaTimes />
                                    </button>
                                </div>
                            )}
                            {userResults.length > 0 && !selectedUser && (
                                <div
                                    className="max-h-40 overflow-y-auto rounded-xl border"
                                    style={{ borderColor: t.inputBorder, color: t.text }}
                                >
                                    {userResults.map((u, i) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedUser(u);
                                                setUserResults([]);
                                            }}
                                            className="w-full text-left px-3 py-2.5 text-sm transition-colors"
                                            style={{
                                                background: t.frame,
                                                borderBottom:
                                                    i < userResults.length - 1
                                                        ? `1px solid ${t.inputBorder}`
                                                        : undefined,
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = t.listHover;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = t.frame;
                                            }}
                                        >
                                            <span className="font-medium">{u.username}</span>
                                            <span className="ml-2 text-xs" style={{ color: t.muted }}>
                                                {u.email}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Filter */}
                    {mode === 'filter' && (
                        <Section title="按注册时间">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className="text-xs block mb-1.5 font-medium" style={{ color: t.muted }}>
                                        注册晚于
                                    </label>
                                    <input
                                        type="date"
                                        value={afterDate}
                                        onChange={(e) => setAfterDate(e.target.value)}
                                        className={`${inputCls} ${inputClsFocus}`}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs block mb-1.5 font-medium" style={{ color: t.muted }}>
                                        注册早于
                                    </label>
                                    <input
                                        type="date"
                                        value={beforeDate}
                                        onChange={(e) => setBeforeDate(e.target.value)}
                                        className={`${inputCls} ${inputClsFocus}`}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={previewFilter}
                                disabled={previewing}
                                className="text-xs px-3.5 py-2 rounded-xl font-medium disabled:opacity-45"
                                style={{
                                    background: t.chipInactiveBg,
                                    color: t.text,
                                    border: `1px solid ${t.inputBorder}`,
                                }}
                            >
                                {previewing ? (
                                    <span className="flex items-center gap-2 justify-center">
                                        <FaSpinner className="animate-spin" /> 计算中…
                                    </span>
                                ) : (
                                    '预览人数'
                                )}
                            </button>
                            {previewCount !== null && (
                                <p className="text-sm mt-3 font-medium" style={{ color: t.text }}>
                                    预计覆盖 <strong>{previewCount}</strong> 名用户
                                </p>
                            )}
                        </Section>
                    )}

                    {/* 正文 */}
                    <Section title="通知文案">
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs block mb-1.5 font-medium" style={{ color: t.muted }}>
                                    标题
                                </label>
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="通知标题"
                                    maxLength={80}
                                    className={`${inputCls} ${inputClsFocus}`}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label className="text-xs block mb-1.5 font-medium" style={{ color: t.muted }}>
                                    内容
                                </label>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="通知正文"
                                    rows={4}
                                    maxLength={300}
                                    className={`${inputCls} ${inputClsFocus} resize-none`}
                                    style={inputStyle}
                                />
                            </div>
                            {(title || body) && (
                                <div
                                    className="px-3.5 py-3 rounded-xl text-sm space-y-1 border"
                                    style={{
                                        background: t.frame,
                                        borderColor: t.inputBorder,
                                        color: t.text,
                                    }}
                                >
                                    <p className="font-semibold leading-snug">{title || '（无标题）'}</p>
                                    <p className="leading-relaxed" style={{ color: t.muted }}>
                                        {body || '（无内容）'}
                                    </p>
                                    <p className="text-[10px] pt-1" style={{ color: t.faint }}>
                                        以上为设备上大致展示效果
                                    </p>
                                </div>
                            )}
                        </div>
                    </Section>

                    {result && (
                        <div
                            className="text-sm px-4 py-3 rounded-xl font-medium"
                            style={{ background: t.successBg, color: t.successText }}
                        >
                            {result}
                        </div>
                    )}
                    {error && (
                        <div
                            className="text-sm px-4 py-3 rounded-xl font-medium"
                            style={{ background: t.errorBg, color: t.errorText }}
                        >
                            {error}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={send}
                        disabled={sending}
                        className="w-full py-3.5 rounded-xl font-semibold text-sm disabled:opacity-45 flex items-center justify-center gap-2 transition-transform active:scale-[0.99]"
                        style={{ background: t.ctaBg, color: t.ctaText }}
                    >
                        {sending ? (
                            <>
                                <FaSpinner className="animate-spin" /> 发送中…
                            </>
                        ) : (
                            <>
                                <FaBell /> {mode === 'broadcast' ? '立即广播' : '发送通知'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const AdminReportsPage = ({ isOpen, onClose, isDarkMode }: AdminReportsPageProps) => {
    const [activeLayer, setActiveLayer] = useState<Tab | null>(null);
    useScrollLock(isOpen);

    useEffect(() => {
        if (!isOpen) setActiveLayer(null);
    }, [isOpen]);

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    const layerTitleMap: Record<Tab, string> = {
        reports: '处理举报',
        users: '用户管理',
        notifications: '发送通知',
    };

    const layerIconMap: Record<Tab, React.ReactNode> = {
        reports: <FaFlag className="text-[12px]" />,
        users: <FaUsers className="text-[12px]" />,
        notifications: <FaBell className="text-[12px]" />,
    };

    const notifyPageBg = isDarkMode ? '#000000' : '#ffffff';
    const notifyHeaderRule = isDarkMode ? '#333333' : '#e5e5e5';

    const shellBg = isDarkMode ? '#0b1324' : '#f5f5f7';
    const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
    const cardBorder = isDarkMode ? '#1f2937' : '#ececf1';
    const labelColor = isDarkMode ? '#94a3b8' : '#9ca3af';
    const textColor = isDarkMode ? '#e5e7eb' : '#000000';
    const dividerColor = isDarkMode ? '#1f2937' : '#ececf1';
    const chevronColor = isDarkMode ? '#6b7280' : '#c4c4c8';
    const fontStack = '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif';

    const menuRows: Tab[] = ['reports', 'users', 'notifications'];

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10002] overflow-hidden"
            style={{
                background: shellBg,
                fontFamily: fontStack,
                overscrollBehaviorY: 'contain',
                touchAction: 'pan-y',
                color: textColor,
            }}
        >
            {/* 第一层：与 AccountPage / 侧栏分组一致 — 实色全屏 + 自右滑入 */}
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                className="absolute inset-0 flex flex-col overflow-hidden"
                style={{ background: shellBg, WebkitOverflowScrolling: 'touch' }}
            >
                <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute left-4 w-8 h-8 flex items-center justify-center"
                        style={{ color: labelColor }}
                    >
                        <FaChevronLeft className="text-base" />
                    </button>
                    <h2 className="text-[18px] font-semibold" style={{ color: textColor }}>
                        管理者界面
                    </h2>
                </div>

                <div
                    className="flex-1 overflow-y-auto px-4 pt-2"
                    style={{ paddingBottom: ADMIN_SCROLL_BOTTOM_PAD, WebkitOverflowScrolling: 'touch' }}
                >
                    <div
                        className="rounded-2xl px-3 py-2.5"
                        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
                    >
                        <p className="text-[11px]" style={{ color: labelColor }}>
                            管理
                        </p>
                        {menuRows.map((layer, idx) => (
                            <button
                                key={layer}
                                type="button"
                                onClick={() => setActiveLayer(layer)}
                                className="w-full flex items-center justify-between text-left"
                                style={{
                                    marginTop: idx === 0 ? 6 : 0,
                                    paddingTop: idx === 0 ? 8 : 10,
                                    paddingBottom: 8,
                                    borderBottom:
                                        idx < menuRows.length - 1 ? `0.5px solid ${dividerColor}` : undefined,
                                }}
                            >
                                <span
                                    className="text-[13px] flex items-center gap-2"
                                    style={{ color: textColor }}
                                >
                                    <span style={{ color: textColor }}>{layerIconMap[layer]}</span>
                                    {layerTitleMap[layer]}
                                </span>
                                <FaChevronRight className="text-[13px]" style={{ color: chevronColor }} />
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* 第二层：子页叠在上层，自右滑入；返回仅退出子层（与账户子页栈一致） */}
            <AnimatePresence>
                {activeLayer && (
                    <motion.div
                        key={activeLayer}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                        className="absolute inset-0 z-10 flex flex-col overflow-hidden"
                        style={{
                            background:
                                activeLayer === 'notifications'
                                    ? notifyPageBg
                                    : shellBg,
                            color:
                                activeLayer === 'notifications'
                                    ? isDarkMode
                                        ? '#ffffff'
                                        : '#000000'
                                    : textColor,
                            WebkitOverflowScrolling: 'touch',
                        }}
                    >
                        <div
                            className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative shrink-0"
                            style={{
                                borderBottom:
                                    activeLayer === 'notifications'
                                        ? `0.5px solid ${notifyHeaderRule}`
                                        : `0.5px solid ${dividerColor}`,
                                background:
                                    activeLayer === 'notifications' ? notifyPageBg : shellBg,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setActiveLayer(null)}
                                className="absolute left-4 w-8 h-8 flex items-center justify-center"
                                style={{
                                    color:
                                        activeLayer === 'notifications'
                                            ? isDarkMode
                                                ? '#a3a3a3'
                                                : '#6b7280'
                                            : labelColor,
                                }}
                            >
                                <FaChevronLeft className="text-base" />
                            </button>
                            <h2
                                className="text-[18px] font-semibold"
                                style={{
                                    color:
                                        activeLayer === 'notifications'
                                            ? isDarkMode
                                                ? '#ffffff'
                                                : '#000000'
                                            : textColor,
                                }}
                            >
                                {layerTitleMap[activeLayer]}
                            </h2>
                        </div>

                        {activeLayer === 'reports' && <ReportsTab isDark={isDarkMode} />}
                        {activeLayer === 'users' && <UsersTab isDark={isDarkMode} />}
                        {activeLayer === 'notifications' && <NotificationsTab isDark={isDarkMode} />}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>,
        document.body
    );
};

export default AdminReportsPage;
