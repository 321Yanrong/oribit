import { motion } from 'framer-motion';
import { FaMapMarkerAlt, FaCalendar, FaUsers, FaHeart, FaReceipt } from 'react-icons/fa';
import { Memory } from '../types';
import { useUserStore, getUserById } from '../store';
import { useState } from 'react';
import ReportModal from './ReportModal';

interface MemoryCardProps {
  memory: Memory;
  onClick?: () => void;
  compact?: boolean;
  onBlockUser: () => void;
  onReportUser: (reason: string) => void;
}

export default function MemoryCard({ memory, onClick, compact = false, onBlockUser, onReportUser }: MemoryCardProps) {
  const taggedUsers = memory.tagged_friends.map(id => getUserById(id)).filter(Boolean);
  const [isReportModalOpen, setReportModalOpen] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${month}月${day}日 ${weekdays[date.getDay()]}`;
  };

  if (compact) {
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className="glass-card p-4 cursor-pointer"
      >
        <div className="flex gap-4">
          {memory.photos[0] && (
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
              <img
                src={memory.photos[0]}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
              <FaMapMarkerAlt className="w-3 h-3 text-orbit-mint" />
              <span className="truncate">{memory.location?.name}</span>
            </div>
            <p className="text-white text-sm line-clamp-2">{memory.content}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="glass-card p-0 cursor-pointer max-w-sm mx-auto w-full overflow-hidden"
    >
      {/* 照片 */}
      {memory.photos.length > 0 && (
        <div className="relative aspect-[4/3]">
          <img
            src={memory.photos[0]}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* 账单标签 */}
          {memory.has_ledger && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute top-4 right-4 px-4 py-2 rounded-full bg-gradient-to-r from-orbit-orange to-amber-400 shadow-lg"
            >
              <div className="flex items-center gap-1.5">
                <FaReceipt className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-semibold">含账单</span>
              </div>
            </motion.div>
          )}

          {/* 地点信息 */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center gap-2 text-white">
              <div className="w-8 h-8 rounded-full bg-orbit-mint/20 flex items-center justify-center">
                <FaMapMarkerAlt className="w-4 h-4 text-orbit-mint" />
              </div>
              <span className="font-medium text-lg">{memory.location?.name}</span>
            </div>
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className="p-5">
        {/* 日期 */}
        <div className="flex items-center gap-2 mb-3">
          <FaCalendar className="w-4 h-4 text-orbit-mint/60" />
          <span className="text-white/50 text-sm">{formatDate(memory.memory_date)}</span>
        </div>

        {/* 内容 */}
        <p className="text-white/90 text-base leading-relaxed mb-4">{memory.content}</p>

        {/* 同行好友 */}
        {taggedUsers.length > 0 && (
          <div className="flex items-center gap-3 pt-3 border-t border-white/10">
            <FaUsers className="w-4 h-4 text-white/40" />
            <div className="flex -space-x-2">
              {taggedUsers.map((user) => (
                <div
                  key={user!.id}
                  className="w-8 h-8 rounded-full ring-2 ring-orbit-dark overflow-hidden"
                  title={user!.username}
                >
                  <img
                    src={user!.avatar_url}
                    alt={user!.username}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
            <span className="text-white/50 text-sm">
              {taggedUsers.map(u => u!.username).join(' · ')}
            </span>
          </div>
        )}

        {/* 互动按钮 */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10">
          <button className="flex items-center gap-1.5 text-white/40 hover:text-orbit-mint transition-colors">
            <FaHeart className="w-4 h-4" />
            <span className="text-sm">收藏</span>
          </button>
        </div>
      </div>

      {/* 菜单 */}
      <div className="menu">
        <button onClick={() => setReportModalOpen(true)} className="menu-item text-orange-500">举报</button>
        <button onClick={onBlockUser} className="menu-item text-gray-500">拉黑该用户</button>
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onSubmit={(reason) => {
          onReportUser(reason);
          setReportModalOpen(false);
        }}
      />
    </motion.div>
  );
}
