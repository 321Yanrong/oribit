import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaCamera, FaTimes, FaSpinner } from 'react-icons/fa';
import { shouldAllowUpload } from '../utils/settings';

interface AvatarUploaderProps {
  currentAvatar: string;
  userId: string;
  onAvatarChange: (url: string) => void;
}

export default function AvatarUploader({ currentAvatar, userId, onAvatarChange }: AvatarUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // 显示预览
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    if (!shouldAllowUpload()) {
      alert('已开启仅 Wi‑Fi 上传，请连接 Wi‑Fi 后重试。');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', userId);

      const { uploadAvatar } = await import('../api/supabase');
      const url = await uploadAvatar(userId, file);
      onAvatarChange(url);
    } catch (error) {
      console.error('Avatar upload failed:', error);
      alert('上传失败，请重试');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div 
      className="relative inline-block"
      whileHover={{ scale: 1.05 }}
    >
      <motion.div
        className="relative w-24 h-24 rounded-2xl overflow-hidden cursor-pointer ring-4 ring-orbit-mint/30 shadow-xl"
        onClick={() => !uploading && fileInputRef.current?.click()}
        whileHover={{ rotate: 5 }}
        whileTap={{ scale: 0.95 }}
      >
        <img 
          src={preview || currentAvatar} 
          alt="头像"
          className="w-full h-full object-cover"
        />
        
        {/* 上传中遮罩 */}
        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <FaSpinner className="w-8 h-8 text-orbit-mint animate-spin" />
          </div>
        )}
        
        {/* 相机图标 */}
        <motion.div 
          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
        >
          <FaCamera className="w-8 h-8 text-white" />
        </motion.div>
      </motion.div>
      
      {/* 编辑徽章 */}
      <motion.div 
        className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-br from-orbit-mint to-emerald-400 flex items-center justify-center shadow-lg cursor-pointer"
        whileHover={{ scale: 1.1, rotate: 15 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <FaCamera className="w-4 h-4 text-white" />
      </motion.div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </motion.div>
  );
}
