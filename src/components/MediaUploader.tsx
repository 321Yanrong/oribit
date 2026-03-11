import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaImage, FaVideo, FaTimes, FaSpinner, FaPlay, FaMicrophone, FaStop, FaTrash, FaBolt } from 'react-icons/fa';

interface MediaUploaderProps {
  userId: string;
  photos: string[];
  videos: string[];
  audios?: string[];
  onPhotosChange: (urls: string[]) => void;
  onVideosChange: (urls: string[]) => void;
  onAudiosChange?: (urls: string[]) => void;
}

// ── 语音录制器 ────────────────────────────────────────────────────
function VoiceRecorder({
  userId, audios, onAudiosChange,
}: { userId: string; audios: string[]; onAudiosChange: (urls: string[]) => void }) {
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
    const valid = Array.from(files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mov|mp4|heic|heif)$/i));
    if (!valid.length) { alert('请选择 Live Photo 文件（.mov / .mp4 / .heic）'); return; }
    setUploading(true);
    try {
      const { uploadMultipleVideos } = await import('../api/supabase');
      const urls = await uploadMultipleVideos(userId, valid);
      onLivePhotosChange([...livePhotos, ...urls]);
    } catch { alert('Live 图上传失败，请重试'); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-4">
      <div onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 py-8 rounded-2xl border-2 border-dashed border-[#FFD700]/30 bg-[#FFD700]/5 cursor-pointer hover:border-[#FFD700]/60 transition-colors">
        {uploading ? <FaSpinner className="text-[#FFD700] text-3xl animate-spin" /> : (
          <>
            <div className="w-14 h-14 rounded-xl bg-[#FFD700]/20 flex items-center justify-center"><FaBolt className="text-[#FFD700] text-2xl" /></div>
            <p className="text-white/50 text-sm text-center">点击上传 Live Photo<br /><span className="text-white/25 text-xs">支持 .mov / .heic / .mp4</span></p>
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
      <input ref={inputRef} type="file" accept="video/*, .heic, .heif, .mov" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
    </div>
  );
}

export default function MediaUploader({
  userId,
  photos,
  videos,
  audios = [],
  onPhotosChange,
  onVideosChange,
  onAudiosChange,
}: MediaUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'photo' | 'video' | 'voice' | 'live'>('photo');
  const [livePhotos, setLivePhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleLiveChange = (urls: string[]) => {
    setLivePhotos(urls);
    const nonLive = videos.filter(v => !livePhotos.includes(v));
    onVideosChange([...nonLive, ...urls]);
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
      return true;
    });

    if (validFiles.length === 0) {
      alert(type === 'photo' ? '请选择图片文件' : '请选择视频文件');
      return;
    }
    setUploading(true);
    try {
      if (type === 'photo') {
        const { uploadMultiplePhotos } = await import('../api/supabase');
        const urls = await uploadMultiplePhotos(userId, validFiles);
        onPhotosChange([...photos, ...urls]);
      } else {
        const { uploadMultipleVideos } = await import('../api/supabase');
        const urls = await uploadMultipleVideos(userId, validFiles);
        onVideosChange([...videos, ...urls]);
      }
    } catch { alert('上传失败，请重试'); }
    finally { setUploading(false); }
  };

  const tabs = [
    { key: 'photo' as const, label: '照片', count: photos.length, color: 'from-orbit-mint to-emerald-400', icon: <FaImage /> },
    { key: 'video' as const, label: '视频', count: videos.filter(v => !livePhotos.includes(v)).length, color: 'from-orbit-orange to-amber-400', icon: <FaVideo /> },
    { key: 'voice' as const, label: '语音', count: audios.length, color: 'from-[#a855f7] to-[#7c3aed]', icon: <FaMicrophone /> },
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
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => onPhotosChange(photos.filter((_, j) => j !== i))} className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-all"><FaTimes className="w-3 h-3" /></button>
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

      {/* ── 语音 ── */}
      {activeTab === 'voice' && (
        <VoiceRecorder userId={userId} audios={audios} onAudiosChange={onAudiosChange || (() => {})} />
      )}

      {/* ── Live 图 ── */}
      {activeTab === 'live' && (
        <LivePhotoUploader userId={userId} livePhotos={livePhotos} onLivePhotosChange={handleLiveChange} />
      )}
    </div>
  );
}
