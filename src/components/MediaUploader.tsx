import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaImage, FaVideo, FaTimes, FaSpinner, FaMicrophone, FaStop, FaTrash, FaBolt } from 'react-icons/fa';
import { track } from '../utils/analytics';
import { shouldAllowUpload } from '../utils/settings';
import imageCompression from 'browser-image-compression';
import { savePendingPhotos, loadPendingPhotos, clearPendingPhotos } from '../utils/pendingUploads';

const UPLOAD_TIMEOUT_MS = 45000;
const MAX_IMAGE_EDGE = 1600;
const MIN_IMAGE_COMPRESS_SIZE = 0.6 * 1024 * 1024; // 600KB 以上才压缩
const MAX_PENDING_FILES = 8;

const withTimeout = async <T,>(promise: Promise<T>, ms = UPLOAD_TIMEOUT_MS): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('上传超时，请检查网络后重试')), ms);
  });
  return Promise.race([promise, timeout]);
};

const ensureWifiUpload = () => {
  if (shouldAllowUpload()) return true;
  alert('已开启仅 Wi‑Fi 上传，请连接 Wi‑Fi 后重试。');
  return false;
};

export interface VoiceRecorderProps {
  userId: string;
  audios: string[];
  onAudiosChange: (urls: string[]) => void;
  compact?: boolean;
}

interface MediaUploaderProps {
  userId: string;
  photos: string[];
  videos: string[];
  onPhotosChange: (urls: string[]) => void;
  onVideosChange: (urls: string[]) => void;
}

const compressImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < MIN_IMAGE_COMPRESS_SIZE) return file;
  try {
    const { default: imageCompression } = await import('browser-image-compression');
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: MAX_IMAGE_EDGE,
      useWebWorker: true,
      initialQuality: 0.85,
    });
    if (compressed && compressed.size < file.size) {
      return new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    }
  } catch (err) {
    console.warn('图片压缩库失败，尝试 fallback 压缩', err);
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch (err) {
    console.warn('图片压缩失败，使用原图上传', err);
    return file;
  }
};

// ── 语音录制器 ────────────────────────────────────────────────────
export function VoiceRecorder({
  userId, audios, onAudiosChange, compact = false,
}: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const start = async () => {
    if (recording || uploading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch { alert('无法访问麦克风，请检查权限'); }
  };

  const stop = () => {
    const mr = mrRef.current;
    if (!mr || mr.state === 'inactive') return;
    mr.addEventListener('stop', async () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunksRef.current.length === 0) {
        setRecording(false);
        setElapsed(0);
        return;
      }
      const mimeType = mr.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setUploading(true);
      try {
        if (!ensureWifiUpload()) {
          return;
        }
        const uploadWithTimeout = async () => {
          const { uploadAudio } = await import('../api/supabase');
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('上传超时')), 30000)
          );
          return Promise.race([uploadAudio(userId, blob), timeout]);
        };
        const url = await uploadWithTimeout();
        onAudiosChange([...audios, url]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        alert(`语音上传失败：${msg}，请重试`);
      } finally { setUploading(false); setRecording(false); setElapsed(0); }
    }, { once: true });
    mr.stop();
  };

  const handleToggle = () => {
    if (uploading) return;
    if (recording) stop(); else void start();
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).toString().padStart(2, '0')}`;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleToggle}
            animate={recording ? { scale: [1, 1.06, 1], transition: { repeat: Infinity, duration: 0.8 } } : {}}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium select-none ${recording ? 'bg-red-500 text-white' : uploading ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-[#00FFB3]/10 text-[#00FFB3] hover:bg-[#00FFB3]/20'}`}
            disabled={uploading}
          >
            {uploading ? <FaSpinner className="text-xs animate-spin" /> : recording ? <FaStop className="text-xs" /> : <FaMicrophone className="text-xs" />}
            <span>{uploading ? '上传中...' : recording ? `停止 ${fmt(elapsed)}` : '语音'}</span>
          </motion.button>
          {!recording && !uploading && <span className="text-white/30 text-xs">文字 / 语音 均可</span>}
        </div>
        {audios.length > 0 && (
          <div className="space-y-1.5">
            {audios.map((url, i) => (
              <div key={url} className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
                <FaMicrophone className="text-[#00FFB3] text-xs shrink-0" />
                <audio src={url} controls className="flex-1 h-7 accent-[#00FFB3]" />
                <button onClick={() => onAudiosChange(audios.filter((_, j) => j !== i))} className="p-1 text-white/30 hover:text-red-400 transition-colors shrink-0">
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 py-6">
        <motion.button
          onClick={handleToggle}
          animate={recording ? { scale: [1, 1.08, 1], transition: { repeat: Infinity, duration: 0.8 } } : {}}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg select-none ${recording ? 'bg-red-500 text-white' : uploading ? 'bg-white/20 text-white/40 cursor-not-allowed' : 'bg-gradient-to-br from-[#00FFB3] to-[#00D9FF] text-black'}`}
          disabled={uploading}
        >
          {uploading ? <FaSpinner className="text-2xl animate-spin" /> : recording ? <FaStop className="text-2xl" /> : <FaMicrophone className="text-2xl" />}
        </motion.button>
        <p className="text-white/50 text-sm">{uploading ? '上传中...' : recording ? `🔴 ${fmt(elapsed)}  点击结束` : '点击开始录音'}</p>
      </div>
      {audios.length > 0 && (
        <div className="space-y-2">
          {audios.map((url, i) => (
            <div key={url} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="p-2 rounded-full bg-[#00FFB3]/10"><FaMicrophone className="text-[#00FFB3] text-sm" /></div>
              <audio src={url} controls className="flex-1 h-8 accent-[#00FFB3]" />
              <button onClick={() => onAudiosChange(audios.filter((_, j) => j !== i))} className="p-1.5 rounded-full bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors">
                <FaTrash className="text-xs" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MediaUploader({
  userId,
  photos,
  videos,
  onPhotosChange,
  onVideosChange,
}: MediaUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'photo' | 'video'>('photo');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<{ files: File[]; type: 'photo' | 'video' } | null>(null);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [effectiveType, setEffectiveType] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [restoringPending, setRestoringPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const markPickingMedia = () => {
    try {
      sessionStorage.setItem('orbit_picking_media', 'true');
    } catch (err) {
      console.warn('set picking media flag failed:', err);
    }
  };

  useEffect(() => {
    const updateNetwork = () => {
      setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
      const conn = (navigator as any)?.connection;
      setEffectiveType(conn?.effectiveType || null);
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    const conn = (navigator as any)?.connection;
    if (conn?.addEventListener) conn.addEventListener('change', updateNetwork);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      if (conn?.removeEventListener) conn.removeEventListener('change', updateNetwork);
    };
  }, []);

  // 恢复未完成的压缩/上传队列
  useEffect(() => {
    const restorePending = async () => {
      if (uploading || restoringPending) return;
      setRestoringPending(true);
      try {
        const files = await loadPendingPhotos();
        if (files.length > 0) {
          console.log('[MediaUploader] 自动恢复上次未完成的上传队列');
          await handlePhotoFiles(files, null, { skipPersist: true });
        }
      } catch (err) {
        console.warn('恢复未完成上传失败:', err);
      } finally {
        setRestoringPending(false);
      }
    };
    void restorePending();
  }, [uploading]);

  const handleRemovePhoto = (photoUrl: string) => {
    onPhotosChange(photos.filter(url => url !== photoUrl));
    if (previewPhoto === photoUrl) setPreviewPhoto(null);
  };

  const handleFileSelect = async (files: File[] | null, type: 'photo' | 'video') => {
    if (!files || uploading) return;
    if (!ensureWifiUpload()) return;
    const fileArr = files;
    setUploadError(null);
    setRetryPayload(null);
    setUploadTotal(0);
    setUploadDone(0);

    const validFiles = fileArr.filter(file => {
      if (type === 'photo' && !file.type.startsWith('image/')) {
        return false;
      }
      if (type === 'video' && !file.type.startsWith('video/')) {
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      alert(type === 'photo' ? '请选择图片文件' : '请选择视频文件');
      return;
    }
    setUploading(true);
    setUploadTotal(validFiles.length);
    setUploadDone(0);
    try {
      if (type === 'photo') {
        const { uploadPhoto } = await import('../api/supabase');
        const urls: string[] = [];
        for (const file of validFiles) {
          const compressed = await compressImage(file);
          const url = await withTimeout(uploadPhoto(userId, compressed));
          urls.push(url);
          setUploadDone((prev) => Math.min(prev + 1, validFiles.length));
        }
        onPhotosChange([...photos, ...urls]);
        track('media_upload_success', { type: 'photo', count: urls.length });
      } else {
        const { uploadVideo } = await import('../api/supabase');
        const urls: string[] = [];
        for (const file of validFiles) {
          const url = await withTimeout(uploadVideo(userId, file));
          urls.push(url);
          setUploadDone((prev) => Math.min(prev + 1, validFiles.length));
        }
        onVideosChange([...videos, ...urls]);
        track('media_upload_success', { type: 'video', count: urls.length });
      }
      setUploadError(null);
      setRetryPayload(null);
    } catch (err) {
      console.error('Upload error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(`上传失败：${msg}`);
      setRetryPayload({ files: validFiles, type });
      alert(`上传失败：${msg}`);
      track('media_upload_failed', { type, reason: msg });
    }
    finally { setUploading(false); }
  };

  const handlePhotoFiles = async (files: File[], inputEl?: HTMLInputElement | null, options?: { skipPersist?: boolean }) => {
    if (!files.length || uploading) return;
    if (!ensureWifiUpload()) return;

    if (!options?.skipPersist) {
      await savePendingPhotos(files, MAX_PENDING_FILES);
    }

    setUploading(true);
    setUploadError(null);
    setRetryPayload(null);
    setUploadTotal(files.length);
    setUploadDone(0);

    // 🚨 唤醒 iOS PWA：给底层留 500ms 恢复网络/内存
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      // 1. 加载上传环境
      const importPromise = import('../api/supabase');
      const timeoutImport = new Promise((_, reject) => setTimeout(() => reject(new Error('网络初始化超时')), 5000));
      const { uploadPhoto } = (await Promise.race([importPromise, timeoutImport])) as any;

      const uploadedUrls: string[] = [];
      const failedFiles: File[] = [];

      for (const file of files) {
        let timeoutId: NodeJS.Timeout | null = null;

        try {
          // 压缩配置
          const options = {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1920,
            useWebWorker: true, // 改回 true，性能更好
            initialQuality: 0.8
          };

          // ✨ 将压缩和上传封装在一个逻辑链路中
          const processPromise = async () => {
            // A. 压缩阶段
            console.log('--- 开始处理图片 ---');
            const compressedFile = await imageCompression(file, options);

            // 打印真实压缩报告
            console.log('压缩成功！');
            console.log('原始体积:', (file.size / 1024).toFixed(2), 'KB');
            console.log('压缩后体积:', (compressedFile.size / 1024).toFixed(2), 'KB');
            console.log('压缩率:', ((1 - compressedFile.size / file.size) * 100).toFixed(2) + '%');

            // B. 上传阶段 - 确保传给 uploadPhoto 的是 compressedFile
            console.log('开始上传到云端...');
            return await uploadPhoto(userId, compressedFile);
          };

          // 30 秒超时控制（针对单张图片的处理+上传）
          const timeoutPromise = new Promise<string>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('图片处理或上传超时')), 30000);
          });

          // 执行赛跑
          const url = await Promise.race([processPromise(), timeoutPromise]);

          uploadedUrls.push(url);
          setUploadDone(prev => Math.min(prev + 1, files.length));
          console.log('✅ 单张图片上传完成:', url);

        } catch (innerErr) {
          console.error('单张图片处理失败:', innerErr);
          failedFiles.push(file);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      // 更新父组件状态
      if (uploadedUrls.length > 0) {
        onPhotosChange([...photos, ...uploadedUrls]);
      }

      // 失败处理
      if (failedFiles.length > 0) {
        await savePendingPhotos(failedFiles, 4); // 假设 MAX 是 4
        alert(`有 ${failedFiles.length} 张图片上传失败，已转入待处理队列`);
      } else {
        await clearPendingPhotos();
      }

    } catch (err) {
      console.error('全局上传失败:', err);
      alert('上传环境加载失败，请检查网络后重试');
    } finally {
      setUploading(false);
      if (inputEl) inputEl.value = '';
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await handlePhotoFiles(files, e.target);
  };

  const handleRetryUpload = async () => {
    if (!retryPayload || uploading) return;
    setUploadError(null);
    setRetryPayload(null);
    const { files, type } = retryPayload;
    await handleFileSelect(files, type);
  };

  const tabs = [
    { key: 'photo' as const, label: '照片', count: photos.length, color: 'from-orbit-mint to-emerald-400', icon: <FaImage /> },
    { key: 'video' as const, label: '视频', count: videos.length, color: 'from-orbit-orange to-amber-400', icon: <FaVideo /> },
  ];

  return (
    <div className="space-y-4">
      {isOffline && (
        <div className="rounded-2xl border border-[#FF6B6B]/30 bg-[#1a1010]/80 px-4 py-3 text-[#FFB4B4] text-sm">
          当前离线中，无法上传。请联网后重试。
        </div>
      )}
      {!isOffline && (effectiveType === '2g' || effectiveType === 'slow-2g') && (
        <div className="rounded-2xl border border-[#FFD166]/30 bg-[#1a1610]/80 px-4 py-3 text-[#FFD166] text-sm">
          当前网络较慢，上传可能失败或耗时较长。
        </div>
      )}
      {uploading && uploadTotal > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-white/60 mb-2">
            <span>上传中…</span>
            <span>{uploadDone}/{uploadTotal}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] transition-all"
              style={{ width: `${Math.min(100, Math.round((uploadDone / Math.max(1, uploadTotal)) * 100))}%` }}
            />
          </div>
        </div>
      )}
      {uploadError && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-200 text-sm flex items-center justify-between gap-3">
          <span className="flex-1">{uploadError}</span>
          {retryPayload && (
            <button
              type="button"
              onClick={handleRetryUpload}
              className="shrink-0 px-3 py-1.5 rounded-full bg-red-400/20 text-red-100 text-xs font-semibold"
            >
              重试
            </button>
          )}
        </div>
      )}
      {/* Tab 切换 */}
      <div className="flex gap-1 p-1 rounded-2xl bg-white/5">
        {tabs.map(tab => (
          <motion.button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all ${activeTab === tab.key ? `bg-gradient-to-r ${tab.color} text-orbit-black font-semibold` : 'text-white/50 hover:text-white'}`}
            whileTap={{ scale: 0.97 }}
          >
            <span className="text-xs">{tab.icon}</span>
            <span className="text-xs whitespace-nowrap">{tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}</span>
          </motion.button>
        ))}
      </div>

      {/* ── 照片 ── */}
      {activeTab === 'photo' && (
        <>
          <div className="rounded-xl border border-[#FFD166]/30 bg-[#1a1610]/80 px-4 py-2 text-[#FFD166] text-xs flex items-center gap-2">
            <FaBolt className="text-[10px]" />
            挑图请尽快完成，iOS 长时间停留相册可能回收应用；未完成队列会自动尝试恢复。
          </div>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, i) => (
                <div key={url} className="relative aspect-square rounded-xl overflow-hidden group shadow-lg">
                  <button type="button" onClick={() => setPreviewPhoto(url)} className="absolute inset-0 z-0">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto(url)}
                    className="absolute bottom-1.5 left-1.5 px-2 py-1 rounded-full bg-black/55 text-white/80 text-[10px] opacity-0 group-hover:opacity-100 transition-all z-10"
                  >
                    放大查看
                  </button>
                  <button onClick={() => handleRemovePhoto(url)} className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-all z-10"><FaTimes className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div onClick={() => { markPickingMedia(); fileInputRef.current?.click(); }} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handlePhotoFiles(Array.from(e.dataTransfer.files || [])); }}
            className={`relative rounded-2xl border-2 border-dashed cursor-pointer transition-all ${dragOver ? 'border-orbit-mint bg-orbit-mint/10' : 'border-white/20 bg-white/5 hover:border-orbit-mint/50'}`} style={{ minHeight: 110 }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              {uploading ? <FaSpinner className="text-orbit-mint text-2xl animate-spin" /> : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-orbit-mint/20 text-orbit-mint flex items-center justify-center"><FaImage className="text-xl" /></div>
                  <p className="text-white/40 text-sm">{dragOver ? '松开上传' : '点击或拖拽添加照片'}</p>
                  <p className="text-white/20 text-xs">已上传 {photos.length} 张</p>
                </>
              )}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onClick={markPickingMedia} onChange={handlePhotoSelect} />
        </>
      )}

      {/* ── 视频 ── */}
      {activeTab === 'video' && (
        <>
          {videos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {videos.map((url, i) => (
                <div key={url} className="relative aspect-video rounded-xl overflow-hidden group">
                  <video src={url} controls playsInline preload="metadata" className="w-full h-full object-cover" />
                  <button onClick={() => onVideosChange(videos.filter((_, j) => j !== i))} className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-all"><FaTimes className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div onClick={() => { markPickingMedia(); videoInputRef.current?.click(); }} className="relative rounded-2xl border-2 border-dashed border-white/20 bg-white/5 hover:border-orbit-orange/50 cursor-pointer transition-all" style={{ minHeight: 110 }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              {uploading ? <FaSpinner className="text-orbit-orange text-2xl animate-spin" /> : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-orbit-orange/20 text-orbit-orange flex items-center justify-center"><FaVideo className="text-xl" /></div>
                  <p className="text-white/40 text-sm">点击添加视频</p>
                </>
              )}
            </div>
          </div>
          <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onClick={markPickingMedia} onChange={e => handleFileSelect(Array.from(e.target.files || []), 'video')} />
        </>
      )}
      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={() => setPreviewPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-3xl bg-[#1a1a1a] border border-white/10 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div>
                  <p className="text-white font-semibold">照片预览</p>
                  <p className="text-white/35 text-xs mt-0.5">轻点空白处关闭预览</p>
                </div>
                <button onClick={() => setPreviewPhoto(null)} className="p-2 rounded-full hover:bg-white/10 text-white/60">
                  <FaTimes className="text-sm" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="rounded-2xl overflow-hidden bg-black/40 border border-white/5">
                  <img src={previewPhoto} alt="预览照片" className="w-full max-h-[60vh] object-contain" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
