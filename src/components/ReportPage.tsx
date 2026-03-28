import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronLeft, FaSpinner, FaCamera } from 'react-icons/fa';
import imageCompression from 'browser-image-compression';
import { supabase } from '../api/supabase';
import { useUserStore } from '../store';
import { useScrollLock } from '../hooks/useScrollLock';
import { STORAGE_LIMIT_BYTES, STORAGE_LIMIT_MB } from '../constants/storageQuota';

interface ReportPageProps {
    isOpen: boolean;
    onClose: () => void;
    targetName: string;
    onSubmit: (reason: string, evidenceUrl?: string) => Promise<void>;
    isDarkMode: boolean;
}

const ReportPage = ({
    isOpen,
    onClose,
    targetName,
    onSubmit,
    isDarkMode
}: ReportPageProps) => {
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { currentUser, setCurrentUser } = useUserStore();

    const reasons = ['发布违规内容', '恶意骚扰', '冒充他人', '垃圾广告', '虚假信息'];

    useScrollLock(isOpen);

    if (!isOpen) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLoading(true);
            try {
                const options = {
                    maxSizeMB: 0.5,
                    maxWidthOrHeight: 1280,
                    useWebWorker: true,
                };
                const compressedFile = await imageCompression(file, options);
                setEvidenceFile(compressedFile);
                setEvidencePreview(URL.createObjectURL(compressedFile));
            } catch (error) {
                console.error('图片压缩失败:', error);
                setEvidenceFile(file);
                setEvidencePreview(URL.createObjectURL(file));
            } finally {
                setLoading(false);
            }
        }
    };

    const handleSub = async () => {
        if (!reason) {
            alert('请选择举报标签');
            return;
        }
        setLoading(true);
        try {
            let uploadedUrl = evidencePreview || undefined;

            // 如果有文件需要上传到 Supabase
            if (evidenceFile) {
                const used = currentUser?.storage_used || 0;
                if (used + evidenceFile.size > STORAGE_LIMIT_BYTES) {
                    const usedMb = (used / 1024 / 1024).toFixed(1);
                    const needMb = (evidenceFile.size / 1024 / 1024).toFixed(1);
                    throw new Error(`存储空间不足：当前已用 ${usedMb}MB，本次需 ${needMb}MB，每位用户上限 ${STORAGE_LIMIT_MB}MB。`);
                }
                const fileExt = evidenceFile.name.split('.').pop() || 'jpg';
                const fileName = `reports/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

                const { error: uploadError } = await (supabase.storage
                    .from('memories') as any)
                    .upload(fileName, evidenceFile);

                if (uploadError) throw uploadError;

                // 上传成功，立即更新本地 Store 中的存储占用（单位：字节）
                if (currentUser && setCurrentUser) {
                    setCurrentUser({
                        ...currentUser,
                        storage_used: (currentUser.storage_used || 0) + evidenceFile.size
                    });
                }

                const { data } = supabase.storage
                    .from('memories')
                    .getPublicUrl(fileName);

                uploadedUrl = data.publicUrl;
            }

            const finalReason = `${reason}: ${description}`;
            await onSubmit(finalReason, uploadedUrl);
            setReason('');
            setDescription('');
            setEvidenceFile(null);
            setEvidencePreview(null);
            onClose();
        } catch (err: any) {
            console.error(err);
            alert(err?.message || '提交失败，请重试');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                    className="fixed inset-0 z-[1000] flex flex-col"
                    style={{ backgroundColor: isDarkMode ? '#070707' : '#f5f5f7' }}
                >
                    {/* Header */}
                    <div
                        className="safe-top sticky top-0 z-20 flex items-center justify-between px-4 pb-4 border-b"
                        style={{
                            background: isDarkMode ? '#1a1a1a' : '#ffffff',
                            borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)'
                        }}
                    >
                        <button onClick={onClose} className="p-2 active:opacity-60">
                            <FaChevronLeft style={{ color: isDarkMode ? '#fff' : '#000' }} />
                        </button>
                        <h2 className="text-lg font-bold" style={{ color: isDarkMode ? '#fff' : '#000' }}>举报投诉</h2>
                        <button
                            onClick={handleSub}
                            disabled={!reason || loading}
                            className="text-blue-500 font-bold disabled:opacity-30"
                        >
                            {loading ? <FaSpinner className="animate-spin" /> : '提交'}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
                        <div className="p-4 rounded-3xl bg-orange-500/10 border border-orange-500/20">
                            <p className="text-sm text-orange-600 font-medium">正在举报：{targetName}</p>
                        </div>

                        <section>
                            <p className="text-sm font-bold mb-3 opacity-60">请选择违规类型</p>
                            <div className="flex flex-wrap gap-2">
                                {reasons.map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setReason(r)}
                                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${reason === r
                                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                                            : (isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-600 border')
                                            }`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section>
                            <p className="text-sm font-bold mb-3 opacity-60">详细描述 (选填)</p>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="请补充更多证据，以便我们核实..."
                                className="w-full h-32 p-4 rounded-3xl outline-none text-[15px]"
                                style={{
                                    background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                    color: isDarkMode ? '#fff' : '#000',
                                    border: isDarkMode ? 'none' : '1px solid #efeff4'
                                }}
                            />
                        </section>

                        <section>
                            <p className="text-sm font-bold mb-3 opacity-60">上传截图证据 (选填)</p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-24 h-24 rounded-3xl flex flex-col items-center justify-center border-2 border-dashed transition-all active:scale-95 overflow-hidden"
                                    style={{
                                        background: isDarkMode ? 'rgba(255,255,255,0.03)' : '#ffffff',
                                        borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                                    }}
                                >
                                    {evidencePreview ? (
                                        <img src={evidencePreview} className="w-full h-full object-cover" alt="evidence" />
                                    ) : (
                                        <>
                                            <FaCamera className="text-xl mb-1 opacity-40" />
                                            <span className="text-[10px] opacity-40">添加图片</span>
                                        </>
                                    )}
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                                {evidencePreview && (
                                    <button
                                        onClick={() => setEvidencePreview(null)}
                                        className="text-xs text-red-500 font-medium"
                                    >
                                        移除图片
                                    </button>
                                )}
                            </div>
                        </section>

                        <p className="text-[11px] text-gray-500 leading-relaxed px-2">
                            Orbit 承诺保护举报人的隐私。核实违规后，我们将根据社区公约对被举报人执行封禁、禁言或限制展示等处罚。
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ReportPage;
