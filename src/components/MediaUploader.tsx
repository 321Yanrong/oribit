import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaImage, FaVideo, FaTimes, FaSpinner, FaPlay, FaMicrophone, FaStop, FaTrash, FaBolt } from 'react-icons/fa';

const MAX_VIDEO_SIZE_MB = 30;
const LIVE_MAX_SIZE_MB = 30;
const UPLOAD_TIMEOUT_MS = 45000;
const MAX_IMAGE_EDGE = 1600;
const MIN_IMAGE_COMPRESS_SIZE = 1.5 * 1024 * 1024; // 1.5MB 以上才压缩

const withTimeout = async <T,>(promise: Promise<T>, ms = UPLOAD_TIMEOUT_MS): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('上传超时，请检查网络后重试')), ms);
  });
  return Promise.race([promise, timeout]);
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

// ── Live 图上传器 ─────────────────────────────────────────────────
function LivePhotoUploader({
  userId, livePhotos, onLivePhotosChange,
}: { userId: string; livePhotos: string[]; onLivePhotosChange: (urls: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || uploading) return;
    const all = Array.from(files);
    const valid = all.filter(f => f.type.startsWith('video/') || f.name.match(/\.(mov|mp4|webm)$/i));
    if (!valid.length) {
      alert('请选择 Live 视频文件（.mov / .mp4 / .webm）');
      return;
    }
    const oversize = valid.find(f => f.size > LIVE_MAX_SIZE_MB * 1024 * 1024);
    if (oversize) {
      alert(`Live 文件不能超过 ${LIVE_MAX_SIZE_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const { uploadVideo } = await import('../api/supabase');
      const urls = await Promise.all(valid.map(file => withTimeout(uploadVideo(userId, file))));
      onLivePhotosChange([...livePhotos, ...urls]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`Live 上传失败：${msg}`);
    }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-4">
      <div onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 py-8 rounded-2xl border-2 border-dashed border-[#FFD700]/30 bg-[#FFD700]/5 cursor-pointer hover:border-[#FFD700]/60 transition-colors">
        {uploading ? <FaSpinner className="text-[#FFD700] text-3xl animate-spin" /> : (
          <>
            <div className="w-14 h-14 rounded-xl bg-[#FFD700]/20 flex items-center justify-center"><FaBolt className="text-[#FFD700] text-2xl" /></div>
            <p className="text-white/50 text-sm text-center">点击上传 Live Photo<br /><span className="text-white/25 text-xs">支持 .mov / .mp4 / .webm（≤30MB）</span></p>
          </>
        )}
      </div>
      {livePhotos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {livePhotos.map((url, i) => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden group">
              <video src={url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[#FFD700] text-[10px] font-bold flex items-center gap-0.5"><FaBolt className="text-[8px]" /> LIVE</div>
              <button onClick={() => onLivePhotosChange(livePhotos.filter((_, j) => j !== i))} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"><FaTimes className="text-xs" /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="video/*,.mov,.mp4,.webm" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
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
  const [livePhotos, setLivePhotos] = useState<string[]>([]);
  const [liveBindings, setLiveBindings] = useState<Array<{ photoUrl: string; liveUrl: string }>>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [linkingLive, setLinkingLive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const liveVideoInputRef = useRef<HTMLInputElement>(null);

  const livePhotoUrlSet = new Set(liveBindings.map(binding => binding.photoUrl));

  const syncLiveUrls = (urls: string[]) => {
    setLivePhotos(urls);
    setLiveBindings(prev => prev.filter(binding => urls.includes(binding.liveUrl)));
    const nonLive = videos.filter(v => !livePhotos.includes(v));
    onVideosChange([...nonLive, ...urls]);
  };

  const handleLiveChange = (urls: string[]) => {
    syncLiveUrls(urls);
  };

  const handleAttachLiveToPhoto = async (files: FileList | null, sourcePhotoUrl: string | null) => {
    if (!files || linkingLive) return;
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
      const nextLiveUrls = [...livePhotos, ...uploadedUrls];
      syncLiveUrls(nextLiveUrls);

      if (sourcePhotoUrl) {
        setLiveBindings(prev => {
          const filtered = prev.filter(binding => binding.photoUrl !== sourcePhotoUrl);
          return [...filtered, ...uploadedUrls.map(liveUrl => ({ photoUrl: sourcePhotoUrl, liveUrl }))];
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
    const relatedLiveUrls = liveBindings.filter(binding => binding.photoUrl === photoUrl).map(binding => binding.liveUrl);
    onPhotosChange(photos.filter(url => url !== photoUrl));
    if (relatedLiveUrls.length > 0) {
      const nextLiveUrls = livePhotos.filter(url => !relatedLiveUrls.includes(url));
      syncLiveUrls(nextLiveUrls);
      setLiveBindings(prev => prev.filter(binding => binding.photoUrl !== photoUrl));
    }
    if (previewPhoto === photoUrl) setPreviewPhoto(null);
  };

  const handleFileSelect = async (files: FileList | null, type: 'photo' | 'video') => {
    if (!files || uploading) return;

    const validFiles = Array.from(files).filter(file => {
      if (type === 'photo' && !file.type.startsWith('image/')) {
        return false;
      }
      if (type === 'video' && !file.type.startsWith('video/')) {
        return false;
      }
      if (type === 'video' && file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      alert(type === 'photo' ? '请选择图片文件' : `请选择视频文件（单条≤${MAX_VIDEO_SIZE_MB}MB）`);
      return;
    }
    setUploading(true);
    try {
      if (type === 'photo') {
        const { uploadPhoto } = await import('../api/supabase');
        const compressed = await Promise.all(validFiles.map(file => compressImage(file)));
        const urls = await Promise.all(compressed.map(file => withTimeout(uploadPhoto(userId, file))));
        onPhotosChange([...photos, ...urls]);
      } else {
        const { uploadVideo } = await import('../api/supabase');
        const urls = await Promise.all(validFiles.map(file => withTimeout(uploadVideo(userId, file))));
        onVideosChange([...videos, ...urls]);
      }
    } catch (err) {
      console.error('Upload error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`上传失败：${msg}`);
    }
    finally { setUploading(false); }
  };

  const tabs = [
    { key: 'photo' as const, label: '照片', count: photos.length, color: 'from-orbit-mint to-emerald-400', icon: <FaImage /> },
    { key: 'video' as const, label: '视频', count: videos.filter(v => !livePhotos.includes(v)).length, color: 'from-orbit-orange to-amber-400', icon: <FaVideo /> },
    { key: 'live'  as const, label: 'Live', count: livePhotos.length, color: 'from-[#FFD700] to-[#FFA500]', icon: <FaBolt /> },
  ];

  return (
    <div className="space-y-4">
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
          <div onClick={() => fileInputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files, 'photo'); }}
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
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileSelect(e.target.files, 'photo')} />
        </>
      )}

      {/* ── 视频 ── */}
      {activeTab === 'video' && (
        <>
          {videos.filter(v => !livePhotos.includes(v)).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {videos.filter(v => !livePhotos.includes(v)).map((url, i) => (
                <div key={url} className="relative aspect-video rounded-xl overflow-hidden group">
                  <video src={url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30"><FaPlay className="text-white/80 text-xl" /></div>
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
          <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={e => handleFileSelect(e.target.files, 'video')} />
        </>
      )}

      {/* ── Live 图 ── */}
      {activeTab === 'live' && (
        <LivePhotoUploader userId={userId} livePhotos={livePhotos} onLivePhotosChange={handleLiveChange} />
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
