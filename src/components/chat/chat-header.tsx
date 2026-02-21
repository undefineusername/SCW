'use client';

import { Phone, Video, Lock, Check, X, Users, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Participant {
  uuid: string
  username: string
  avatar?: string
}

interface ChatHeaderProps {
  name: string
  avatar: string
  themeAccent: string
  isDark: boolean
  fontSize: 'sm' | 'md' | 'lg'
  isOnline?: boolean
  secret?: string
  onSecretChange: (secret: string) => void
  isGroup?: boolean
  participants?: Participant[]
  onVoiceCall?: () => void
  onVideoCall?: () => void
}

const themeColorMap: Record<string, { hover: string; hoverDark: string; icon: string; iconDark: string; badge: string }> = {
  'purple-500': { hover: 'hover:bg-purple-50', hoverDark: 'hover:bg-gray-700', icon: 'text-purple-600', iconDark: 'text-purple-400', badge: 'bg-purple-500' },
  'blue-500': { hover: 'hover:bg-blue-50', hoverDark: 'hover:bg-gray-700', icon: 'text-blue-600', iconDark: 'text-blue-400', badge: 'bg-blue-500' },
  'green-500': { hover: 'hover:bg-green-50', hoverDark: 'hover:bg-gray-700', icon: 'text-green-600', iconDark: 'text-green-400', badge: 'bg-green-500' },
  'orange-500': { hover: 'hover:bg-orange-50', hoverDark: 'hover:bg-gray-700', icon: 'text-orange-600', iconDark: 'text-orange-400', badge: 'bg-orange-500' },
  'pink-500': { hover: 'hover:bg-pink-50', hoverDark: 'hover:bg-gray-700', icon: 'text-pink-600', iconDark: 'text-pink-400', badge: 'bg-pink-500' },
}

export default function ChatHeader({
  name, avatar, themeAccent, isDark, fontSize, isOnline,
  secret, onSecretChange, isGroup, participants = [],
  onVoiceCall, onVideoCall
}: ChatHeaderProps) {
  const [isEditingSecret, setIsEditingSecret] = useState(false)
  const [tempSecret, setTempSecret] = useState(secret || '')
  const [showMembers, setShowMembers] = useState(false)

  const textSizeClass = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base'
  const colors = themeColorMap[themeAccent] || themeColorMap['purple-500']
  const hoverClass = isDark ? colors.hoverDark : colors.hover
  const iconClass = isDark ? colors.iconDark : colors.icon

  const handleSaveSecret = () => {
    onSecretChange(tempSecret)
    setIsEditingSecret(false)
  }

  const memberCount = participants.length

  return (
    <div>
      {/* ── 메인 헤더 줄 ── */}
      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3`}>
        <div className="flex items-center justify-between">
          {/* 왼쪽: 아바타 + 이름 + 상태 */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`relative w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 shadow-sm overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-200'
              }`}>
              {isGroup ? '👥' : (
                avatar?.startsWith('data:image') ? (
                  <img src={avatar} alt={name} className="w-full h-full object-cover" />
                ) : (avatar || '👤')
              )}
              {!isGroup && isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h2 className={`${textSizeClass} font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {name}
                </h2>
                {isGroup && memberCount > 0 && (
                  <span className={`text-[12px] font-semibold flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {memberCount}
                  </span>
                )}
              </div>
              <p className={`text-[11px] font-medium ${isGroup
                ? (isDark ? 'text-gray-500' : 'text-gray-400')
                : isOnline ? 'text-green-500' : (isDark ? 'text-gray-500' : 'text-gray-400')
                }`}>
                {isGroup
                  ? `참여자 ${memberCount}명`
                  : isOnline ? '온라인' : '오프라인'}
              </p>
            </div>
          </div>

          {/* 오른쪽: 버튼들 */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* 그룹 멤버 토글 */}
            {isGroup && (
              <button
                onClick={() => setShowMembers(v => !v)}
                className={`p-2 rounded-lg transition-colors ${hoverClass} flex items-center gap-1`}
                title="멤버 목록"
              >
                <Users size={17} className={iconClass} />
                <ChevronDown
                  size={12}
                  className={`${iconClass} transition-transform duration-200 ${showMembers ? 'rotate-180' : ''}`}
                />
              </button>
            )}

            {/* E2EE 자물쇠 */}
            {isEditingSecret ? (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
                <input
                  type="password"
                  value={tempSecret}
                  onChange={(e) => setTempSecret(e.target.value)}
                  placeholder="Chat Secret"
                  className="bg-transparent text-xs outline-none w-20"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveSecret()}
                />
                <button onClick={handleSaveSecret} className="text-green-500 hover:scale-110 transition-transform">
                  <Check size={13} />
                </button>
                <button onClick={() => setIsEditingSecret(false)} className="text-red-400 hover:scale-110 transition-transform">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingSecret(true)}
                className={`p-2 rounded-lg transition-colors ${hoverClass} group flex items-center gap-1.5`}
                title="E2EE 암호 설정"
              >
                <Lock size={17} className={secret ? 'text-green-500' : iconClass} />
                {!secret && (
                  <span className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    E2EE
                  </span>
                )}
              </button>
            )}

            <button
              className={`p-2 rounded-lg transition-colors ${hoverClass}`}
              onClick={onVoiceCall}
              title="음성통화"
            >
              <Phone size={17} className={iconClass} />
            </button>
            <button
              type="button"
              className={`p-2 rounded-lg transition-colors ${hoverClass}`}
              onClick={() => {
                console.log("🎥 Video call button clicked!");
                onVideoCall?.();
              }}
              title="영상통화"
            >
              <Video size={17} className={iconClass} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 멤버 목록 드로어 (슬라이드 다운) ── */}
      <AnimatePresence>
        {isGroup && showMembers && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className={`overflow-hidden border-b ${isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
          >
            <div className="px-4 py-3">
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                참여자 {memberCount}명
              </p>
              <div className="flex flex-wrap gap-3">
                {participants.map((p) => (
                  <div key={p.uuid} className="flex flex-col items-center gap-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base overflow-hidden shadow-sm ${isDark ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                      {p.avatar?.startsWith('data:image') ? (
                        <img src={p.avatar} alt={p.username} className="w-full h-full object-cover" />
                      ) : (p.avatar || '👤')}
                    </div>
                    <span className={`text-[10px] font-medium text-center max-w-[52px] truncate ${isDark ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                      {p.username}
                    </span>
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>참여자 없음</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
