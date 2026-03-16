import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaImage, FaVideo, FaTimes, FaSpinner, FaMicrophone, FaStop, FaTrash, FaBolt } from 'react-icons/fa';
import { track } from '../utils/analytics';
import { shouldAllowUpload } from '../utils/settings';
import imageCompression from 'browser-image-compression';

const LIVE_MAX_SIZE_MB = 30;
const UPLOAD_TIMEOUT_MS = 45000;
const MAX_IMAGE_EDGE = 1600;
const MIN_IMAGE_COMPRESS_SIZE = 0.6 * 1024 * 1024; // 600KB 以上才压缩

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
      // prefer webm; fall back to whatever the browser supports
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
      // Guard: no audio data collected (tap was too short)
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
        // 30-second upload timeout guard
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

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

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
  }

  return (
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

type LiveItem = { url: string; mediaType: 'video' | 'image' };

// ── Live 图上传器 ─────────────────────────────────────────────────
function LivePhotoUploader({
  userId,
  liveItems,
  onAddLiveVideos,
  onAddLiveImages,
  onRemoveLiveItem,
}: {
  userId: string;
  liveItems: LiveItem[];
  onAddLiveVideos: (urls: string[]) => void;
  onAddLiveImages: (urls: string[]) => void;
  onRemoveLiveItem: (item: LiveItem) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || uploading) return;
    if (!ensureWifiUpload()) return;
    const all = Array.from(files);
    const videoFiles = all.filter(f => f.type.startsWith('video/') || f.name.match(/\.(mov|mp4|webm)$/i));
    const imageFiles = all.filter(f => f.type.startsWith('image/') || f.name.match(/\.(heic|heif|jpg|jpeg|png)$/i));
    if (!videoFiles.length && !imageFiles.length) {
      alert('请选择 Live 视频或 Live 照片（支持 .mov / .mp4 / .webm / .heic / .heif）');
      return;
    }
    const oversize = [...videoFiles, ...imageFiles].find(f => f.size > LIVE_MAX_SIZE_MB * 1024 * 1024);
    if (oversize) {
      alert(`Live 文件不能超过 ${LIVE_MAX_SIZE_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const { uploadVideo, uploadPhoto } = await import('../api/supabase');
      const [videoUrls, imageUrls] = await Promise.all([
        Promise.all(videoFiles.map(file => withTimeout(uploadVideo(userId, file)))),
        Promise.all(imageFiles.map(file => withTimeout(uploadPhoto(userId, file)))),
      ]);
      if (videoUrls.length) onAddLiveVideos(videoUrls);
      if (imageUrls.length) onAddLiveImages(imageUrls);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`Live 上传失败：${msg}`);
    }
    finally {
      setUploading(false);
      setUploadTotal(0);
      setUploadDone(0);
    }
  };

  return (
    <div className="space-y-4">
      <div onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 py-8 rounded-2xl border-2 border-dashed border-[#FFD700]/30 bg-[#FFD700]/5 cursor-pointer hover:border-[#FFD700]/60 transition-colors">
        {uploading ? <FaSpinner className="text-[#FFD700] text-3xl animate-spin" /> : (
          <>
            <div className="w-14 h-14 rounded-xl bg-[#FFD700]/20 flex items-center justify-center"><FaBolt className="text-[#FFD700] text-2xl" /></div>
            <p className="text-white/50 text-sm text-center">点击上传 Live Photo<br /><span className="text-white/25 text-xs">支持 .mov / .mp4 / .webm / .heic / .heif（≤30MB）</span></p>
          </>
        )}
      </div>
      {liveItems.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {liveItems.map((item) => (
            <div key={item.url} className="relative aspect-square rounded-xl overflow-hidden group">
              {item.mediaType === 'video' ? (
                <video src={item.url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
              ) : (
                <img src={item.url} className="w-full h-full object-cover" />
              )}
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[#FFD700] text-[10px] font-bold flex items-center gap-0.5"><FaBolt className="text-[8px]" /> LIVE</div>
              <button onClick={() => onRemoveLiveItem(item)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"><FaTimes className="text-xs" /></button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*,.mov,.mp4,.webm,.heic,.heif"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
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
  const [activeTab, setActiveTab] = useState<'photo' | 'video' | 'live'>('photo');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<{ files: File[]; type: 'photo' | 'video' } | null>(null);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [effectiveType, setEffectiveType] = useState<string | null>(null);
  const [liveVideos, setLiveVideos] = useState<string[]>([]);
  const [liveImages, setLiveImages] = useState<string[]>([]);
  const [liveBindings, setLiveBindings] = useState<Array<{ photoUrl: string; liveUrl: string; liveType: 'video' | 'image' }>>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [linkingLive, setLinkingLive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const liveVideoInputRef = useRef<HTMLInputElement>(null);

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

  const livePhotoUrlSet = new Set(liveBindings.map(binding => binding.photoUrl));
  const liveItems: LiveItem[] = [
    ...liveImages.map(url => ({ url, mediaType: 'image' as const })),
    ...liveVideos.map(url => ({ url, mediaType: 'video' as const })),
  ];

  const syncLiveVideos = (urls: string[]) => {
    setLiveVideos(urls);
    setLiveBindings(prev => prev.filter(binding => binding.liveType === 'image' || urls.includes(binding.liveUrl)));
    const nonLive = videos.filter(v => !liveVideos.includes(v) && !urls.includes(v));
    onVideosChange([...nonLive, ...urls]);
  };

  const syncLiveImages = (urls: string[]) => {
    setLiveImages(urls);
    setLiveBindings(prev => prev.filter(binding => binding.liveType === 'video' || urls.includes(binding.liveUrl)));
    const nonLivePhotos = photos.filter(p => !liveImages.includes(p) && !urls.includes(p));
    onPhotosChange([...nonLivePhotos, ...urls]);
  };

  const handleAddLiveVideos = (urls: string[]) => {
    if (!urls.length) return;
    const next = Array.from(new Set([...liveVideos, ...urls]));
    syncLiveVideos(next);
  };

  const handleAddLiveImages = (urls: string[]) => {
    if (!urls.length) return;
    const next = Array.from(new Set([...liveImages, ...urls]));
    syncLiveImages(next);
    setLiveBindings(prev => {
      const nextBindings = [...prev];
      urls.forEach(url => {
        if (!nextBindings.some(b => b.liveType === 'image' && b.liveUrl === url)) {
          nextBindings.push({ photoUrl: url, liveUrl: url, liveType: 'image' });
        }
      });
      return nextBindings;
    });
  };

  const handleRemoveLiveItem = (item: LiveItem) => {
    if (item.mediaType === 'video') {
      const next = liveVideos.filter(url => url !== item.url);
      syncLiveVideos(next);
      setLiveBindings(prev => prev.filter(binding => !(binding.liveType === 'video' && binding.liveUrl === item.url)));
    } else {
      const next = liveImages.filter(url => url !== item.url);
      syncLiveImages(next);
      setLiveBindings(prev => prev.filter(binding => !(binding.liveType === 'image' && binding.liveUrl === item.url)));
    }
  };

  const handleAttachLiveToPhoto = async (files: FileList | null, sourcePhotoUrl: string | null) => {
    if (!files || linkingLive) return;
    if (!ensureWifiUpload()) return;
    const validFiles = Array.from(files).filter(file => file.type.startsWith('video/') || file.name.match(/\.(mov|mp4|webm)$/i));
    if (!validFiles.length) {
      alert('请选择 Live 视频文件（.mov / .mp4 / .webm）');
      return;
    }

    const oversize = validFiles.find(file => file.size > LIVE_MAX_SIZE_MB * 1024 * 1024);
    if (oversize) {
      alert(`Live 文件不能超过 ${LIVE_MAX_SIZE_MB}MB`);
      return;
    }

    setLinkingLive(true);
    try {
      const { uploadVideo } = await import('../api/supabase');
      const uploadedUrls = await Promise.all(validFiles.map(file => withTimeout(uploadVideo(userId, file))));
      const nextLiveUrls = Array.from(new Set([...liveVideos, ...uploadedUrls]));
      syncLiveVideos(nextLiveUrls);

      if (sourcePhotoUrl) {
        setLiveBindings(prev => {
          const filtered = prev.filter(binding => binding.photoUrl !== sourcePhotoUrl);
          return [...filtered, ...uploadedUrls.map(liveUrl => ({ photoUrl: sourcePhotoUrl, liveUrl, liveType: 'video' }))];
        });
      }

      alert(sourcePhotoUrl ? '已为这张照片附加 Live 效果' : 'Live 上传成功');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`Live 上传失败：${msg}`);
    } finally {
      setLinkingLive(false);
      if (liveVideoInputRef.current) liveVideoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (photoUrl: string) => {
    const relatedLiveVideos = liveBindings.filter(binding => binding.photoUrl === photoUrl && binding.liveType === 'video').map(binding => binding.liveUrl);
    const relatedLiveImages = liveBindings.filter(binding => binding.photoUrl === photoUrl && binding.liveType === 'image').map(binding => binding.liveUrl);
    onPhotosChange(photos.filter(url => url !== photoUrl));
    if (relatedLiveVideos.length > 0) {
      const nextLiveUrls = liveVideos.filter(url => !relatedLiveVideos.includes(url));
      syncLiveVideos(nextLiveUrls);
    }
    if (relatedLiveImages.length > 0) {
      const nextLiveImages = liveImages.filter(url => !relatedLiveImages.includes(url));
      syncLiveImages(nextLiveImages);
    }
    if (relatedLiveVideos.length > 0 || relatedLiveImages.length > 0) {
      setLiveBindings(prev => prev.filter(binding => binding.photoUrl !== photoUrl));
    }
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

  const handlePhotoFiles = async (files: File[], inputEl?: HTMLInputElement | null) => {
    if (!files.length || uploading) return;
    if (!ensureWifiUpload()) return;

    setUploading(true);
    setUploadError(null);
    setRetryPayload(null);
    setUploadTotal(files.length);
    setUploadDone(0);

    // 🚨 唤醒 iOS PWA：给底层留 500ms 恢复网络/内存
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      // 1. import 也加 5 秒超时，避免断网卡死
      const importPromise = import('../api/supabase');
      const timeoutImport = new Promise((_, reject) => setTimeout(() => reject(new Error('网络初始化超时')), 5000));
      const { uploadPhoto } = (await Promise.race([importPromise, timeoutImport])) as any;

      const uploadedUrls: string[] = [];

      for (const file of files) {
        let timeoutId: NodeJS.Timeout | null = null;
        try {
          const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1920, useWebWorker: false, initialQuality: 0.8 };

          // 压缩+上传完整链路
          const processPromise = async () => {
            console.log('开始压缩图片...');
            const compressedFile = await imageCompression(file, options);
            console.log('压缩完成，开始上传...');
            return await uploadPhoto(userId, compressedFile);
          };

          // 20 秒强制超时（压缩+上传）
          const timeoutPromise = new Promise<string>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('图片处理超时，请检查网络')), 20000);
          });

          const url = await Promise.race([processPromise(), timeoutPromise]);

          uploadedUrls.push(url);
          setUploadDone(prev => Math.min(prev + 1, files.length));
        } catch (innerErr) {
          console.error('单张图片处理失败:', innerErr);
          alert(`图片 ${file.name} 处理失败：${(innerErr as any)?.message || '请重试'}`);
        } finally {
          // 清理定时器，避免未捕获异常
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      if (uploadedUrls.length > 0) {
        onPhotosChange([...photos, ...uploadedUrls]);
      }
    } catch (err) {
      console.error('上传环境加载失败:', err);
      alert('系统异常，请稍后重试');
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
    { key: 'video' as const, label: '视频', count: videos.filter(v => !liveVideos.includes(v)).length, color: 'from-orbit-orange to-amber-400', icon: <FaVideo /> },
    { key: 'live'  as const, label: 'Live', count: liveItems.length, color: 'from-[#FFD700] to-[#FFA500]', icon: <FaBolt /> },
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
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, i) => (
                <div key={url} className="relative aspect-square rounded-xl overflow-hidden group shadow-lg">
                  <button type="button" onClick={() => setPreviewPhoto(url)} className="absolute inset-0 z-0">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                  {livePhotoUrlSet.has(url) && (
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[#FFD700] text-[10px] font-bold flex items-center gap-0.5 z-10">
                      <FaBolt className="text-[8px]" /> LIVE
                    </div>
                  )}
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
          <div onClick={() => fileInputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handlePhotoFiles(Array.from(e.dataTransfer.files || [])); }}
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
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
        </>
      )}

      {/* ── 视频 ── */}
      {activeTab === 'video' && (
        <>
          {videos.filter(v => !liveVideos.includes(v)).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {videos.filter(v => !liveVideos.includes(v)).map((url, i) => (
                <div key={url} className="relative aspect-video rounded-xl overflow-hidden group">
                  <video src={url} controls playsInline preload="metadata" className="w-full h-full object-cover" />
                  <button onClick={() => onVideosChange(videos.filter((_, j) => j !== i))} className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-all"><FaTimes className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div onClick={() => videoInputRef.current?.click()} className="relative rounded-2xl border-2 border-dashed border-white/20 bg-white/5 hover:border-orbit-orange/50 cursor-pointer transition-all" style={{ minHeight: 110 }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              {uploading ? <FaSpinner className="text-orbit-orange text-2xl animate-spin" /> : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-orbit-orange/20 text-orbit-orange flex items-center justify-center"><FaVideo className="text-xl" /></div>
                  <p className="text-white/40 text-sm">点击添加视频</p>
                </>
              )}
            </div>
          </div>
          <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={e => handleFileSelect(Array.from(e.target.files || []), 'video')} />
        </>
      )}

      {/* ── Live 图 ── */}
      {activeTab === 'live' && (
        <LivePhotoUploader
          userId={userId}
          liveItems={liveItems}
          onAddLiveVideos={handleAddLiveVideos}
          onAddLiveImages={handleAddLiveImages}
          onRemoveLiveItem={handleRemoveLiveItem}
        />
      )}

      <input
        ref={liveVideoInputRef}
        type="file"
        accept="video/*,.mov,.mp4,.webm"
        multiple={false}
        className="hidden"
        onChange={e => handleAttachLiveToPhoto(e.target.files, previewPhoto)}
      />

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
                  <p className="text-white/35 text-xs mt-0.5">可以直接为这张照片勾选 Live</p>
                </div>
                <button onClick={() => setPreviewPhoto(null)} className="p-2 rounded-full hover:bg-white/10 text-white/60">
                  <FaTimes className="text-sm" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="rounded-2xl overflow-hidden bg-black/40 border border-white/5">
                  <img src={previewPhoto} alt="预览照片" className="w-full max-h-[60vh] object-contain" />
                </div>

                <button
                  type="button"
                  onClick={() => liveVideoInputRef.current?.click()}
                  disabled={linkingLive}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-semibold transition-all ${livePhotoUrlSet.has(previewPhoto) ? 'bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30' : 'bg-white/5 text-white/80 border border-white/10 hover:border-[#FFD700]/40 hover:text-[#FFD700]'} disabled:opacity-50`}
                >
                  {linkingLive ? <FaSpinner className="animate-spin" /> : <FaBolt />}
                  <span>{livePhotoUrlSet.has(previewPhoto) ? '重新选择这张图的 Live 视频' : '勾选为 Live 并选择视频'}</span>
                </button>

                <p className="text-white/35 text-xs leading-relaxed">
                  说明：先选照片，再在这里为它补一段 Live 视频，这样用户不需要单独切到 Live 标签再上传。
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
