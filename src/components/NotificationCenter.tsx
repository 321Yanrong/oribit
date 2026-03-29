import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUserStore } from '../store'
import {
  getNotifications,
  markNotificationsRead,
  getMemoryById,
  NotificationRow,
} from '../api/supabase'

const FRIEND_TYPES = new Set(['friend_request', 'friend_accepted', 'friend_bind', 'friend_rejected'])

const META_PREFIX = '[orbit_meta:'
const stripOrbitMeta = (content: string): string => {
  if (!content?.startsWith(META_PREFIX)) return content || ''
  const end = content.indexOf(']\n')
  if (end === -1) return content
  return content.slice(end + 2)
}

const typeLabel = (type: string): string => {
  switch (type) {
    case 'at': return '在回忆里提到了你'
    case 'comment': return '评论了你们的回忆'
    case 'like': return '点赞了你的回忆'
    default: return '有新消息'
  }
}

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function useUnreadCount() {
  const { currentUser } = useUserStore()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!currentUser?.id) { setCount(0); return }
    try {
      const rows = await getNotifications(currentUser.id, 50)
      const n = rows.filter((r) => !FRIEND_TYPES.has(r.type) && !r.read).length
      setCount(n)
    } catch {
      setCount(0)
    }
  }, [currentUser?.id])

  useEffect(() => {
    void refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  return { count, refresh }
}

interface NotificationCenterProps {
  onNavigateToMemory?: (memoryId: string) => void
  /** Called when the user taps a notification — parent opens the memory detail modal */
  onOpenMemory?: (memory: any) => void
  /** When set to true by parent, re-opens the panel (parent resets it to false) */
  forceOpen?: boolean
  onForceOpenConsumed?: () => void
}

export default function NotificationCenter(props: NotificationCenterProps) {
  const { currentUser } = useUserStore()

  // All useState before any useEffect (keeps hooks call order stable)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMemory, setLoadingMemory] = useState<string | null>(null)
  const { count: unreadCount, refresh: refreshCount } = useUnreadCount()

  // Re-open panel when parent signals (e.g. after closing MemoryDetailModal)
  useEffect(() => {
    if (props.forceOpen) {
      setOpen(true)
      props.onForceOpenConsumed?.()
    }
  }, [props.forceOpen])

  const fetchNotifications = useCallback(async () => {
    if (!currentUser?.id) return
    setLoading(true)
    try {
      const data = await getNotifications(currentUser.id, 20)
      setNotifications(data.filter((n) => !FRIEND_TYPES.has(n.type)))
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  const handleOpen = async () => {
    setOpen(true)
    await fetchNotifications()
    if (currentUser?.id) {
      try {
        await markNotificationsRead(currentUser.id)
        void refreshCount()
      } catch {
        // ignore
      }
    }
  }

  const handleClose = () => setOpen(false)

  const handleItemClick = async (item: NotificationRow) => {
    if (!item.entity_id) return
    setLoadingMemory(item.id)
    try {
      const memory = await getMemoryById(item.entity_id)
      if (memory && props.onOpenMemory) {
        // Hide the notification panel so the modal appears on top.
        // When the modal closes, MemoryStreamPage calls onReturnToNotifications
        // and we re-show the panel.
        setOpen(false)
        props.onOpenMemory(memory)
      }
    } catch {
      // silently ignore — nothing to navigate to
    } finally {
      setLoadingMemory(null)
    }
  }

  if (!currentUser) return null

  const bgColor = 'var(--orbit-surface)'
  const borderColor = 'var(--orbit-border)'
  const textColor = 'var(--orbit-text)'
  const mutedColor = 'var(--orbit-text-muted, #94a3b8)'

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="fixed inset-0 z-[9980] flex flex-col"
          style={{
            backgroundColor: bgColor,
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b"
            style={{ borderColor }}
          >
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ color: mutedColor }}
              aria-label="返回"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 className="text-base font-semibold" style={{ color: textColor }}>
              全部互动消息
            </h2>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-6 h-6 rounded-full border-2"
                  style={{ borderColor: borderColor, borderTopColor: textColor }}
                />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <span className="text-4xl">🔔</span>
                <p className="text-sm" style={{ color: mutedColor }}>暂无互动消息</p>
              </div>
            ) : (
              <ul>
                {notifications.map((item) => {
                  const actorName = item.actor?.username || '好友'
                  const avatarUrl = item.actor?.avatar_url
                  const actionText = typeLabel(item.type)
                  const thumbUrl = item.memory?.photos?.[0] ?? null
                  const memoryText = item.memory
                    ? stripOrbitMeta(item.memory.content || '').trim()
                    : null
                  const isLoadingThis = loadingMemory === item.id

                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleItemClick(item)}
                        disabled={isLoadingThis}
                        className="w-full flex items-center gap-3 px-4 py-3 border-b text-left active:opacity-70 transition-opacity"
                        style={{
                          borderColor,
                          backgroundColor: item.read
                            ? 'transparent'
                            : 'rgba(255,255,255,0.05)',
                        }}
                      >
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={actorName}
                              className="w-11 h-11 rounded-full object-cover"
                              style={{ border: `1px solid ${borderColor}` }}
                            />
                          ) : (
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold"
                              style={{ background: '#1e3a5f', color: textColor }}
                            >
                              {actorName[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                        </div>

                        {/* Name + action + time */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug truncate" style={{ color: textColor }}>
                            <span className="font-semibold">{actorName}</span>
                            {' '}
                            <span style={{ color: mutedColor }}>{actionText}</span>
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: mutedColor }}>
                            {timeAgo(item.created_at)}
                          </p>
                          {!item.read && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mt-1" />
                          )}
                        </div>

                        {/* Memory thumbnail */}
                        {item.memory !== undefined && (
                          <div className="flex-shrink-0 ml-1">
                            {isLoadingThis ? (
                              <div
                                className="w-[50px] h-[50px] rounded-md flex items-center justify-center"
                                style={{ background: '#1a2a40' }}
                              >
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                  className="w-4 h-4 rounded-full border-2"
                                  style={{ borderColor: borderColor, borderTopColor: mutedColor }}
                                />
                              </div>
                            ) : thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt=""
                                className="w-[50px] h-[50px] rounded-md object-cover"
                                style={{ border: `1px solid ${borderColor}` }}
                              />
                            ) : (
                              <div
                                className="w-[50px] h-[50px] rounded-md flex items-center justify-center"
                                style={{ background: '#1a2a40' }}
                              >
                                <span
                                  className="text-[9px] font-medium text-center leading-tight px-1"
                                  style={{ color: mutedColor }}
                                >
                                  {memoryText ? memoryText.slice(0, 8) : '文字回忆'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {/* Bell icon button */}
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-9 h-9 rounded-full"
        style={{ color: mutedColor }}
        aria-label="通知"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
            style={{ background: '#ef4444', lineHeight: 1 }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel rendered via portal so it escapes any ancestor stacking context */}
      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </>
  )
}
