import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaImage, FaTimes, FaSpinner } from 'react-icons/fa';

interface PhotoUploaderProps {
  userId: string;
  photos: string[];
  onPhotosChange: (urls: string[]) => void;
  maxPhotos?: number;
}

export default function PhotoUploader({
  userId,
  photos,
  onPhotosChange,
  maxPhotos = 4,
}: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || uploading) return;
    
    const validFiles = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB');
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const remainingSlots = maxPhotos - photos.length;
    const filesToUpload = validFiles.slice(0, remainingSlots);

    if (filesToUpload.length < validFiles.length) {
      alert(`最多只能上传 ${maxPhotos} 张照片`);
    }

    setUploading(true);

    try {
      const { uploadMultiplePhotos } = await import('../api/supabase');
      const urls = await uploadMultiplePhotos(userId, filesToUpload);
      onPhotosChange([...photos, ...urls]);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {/* 已上传的照片预览 */}
      <AnimatePresence>
        {photos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-2 gap-3"
          >
            {photos.map((url, index) => (
              <motion.div
                key={url}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative aspect-square rounded-2xl overflow-hidden group shadow-lg"
              >
                <img
                  src={url}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* 删除按钮 */}
                <button
                  onClick={() => handleRemovePhoto(index)}
                  className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-black/70 hover:scale-110"
                >
                  <FaTimes className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 上传区域 */}
      {photos.length < maxPhotos && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative aspect-video rounded-2xl border-2 border-dashed cursor-pointer
            transition-all duration-300 overflow-hidden
            ${dragOver 
              ? 'border-orbit-mint bg-orbit-mint/10' 
              : 'border-white/20 bg-white/5 hover:border-orbit-mint/50'
            }
          `}
        >
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-orbit-dark/80">
              <div className="text-center">
                <FaSpinner className="w-10 h-10 text-orbit-mint animate-spin mx-auto mb-2" />
                <p className="text-white/60 text-sm">上传中...</p>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center transition-all ${
                  dragOver ? 'bg-orbit-mint text-orbit-black' : 'bg-white/10 text-white/40'
                }`}>
                  <FaImage className="w-6 h-6" />
                </div>
                <p className={`text-sm transition-colors ${dragOver ? 'text-orbit-mint' : 'text-white/40'}`}>
                  {dragOver ? '松开以上传' : '点击或拖拽添加照片'}
                </p>
                <p className="text-white/20 text-xs mt-1">
                  {photos.length}/{maxPhotos} 张
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />
    </div>
  );
}
