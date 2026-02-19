'use client';

interface Participant {
  uuid: string
  username: string
  avatar?: string
}

interface Conversation {
  id: string
  username: string
  avatar: string
  lastMessage: string
  lastTimestamp: Date
  unreadCount: number
  isGroup?: boolean
  participants?: Participant[]
}

interface ConversationListProps {
  conversation: Conversation
  isSelected: boolean
  onSelect: () => void
  themeAccent: string
  isDark: boolean
  fontSize: 'sm' | 'md' | 'lg'
  isOnline?: boolean
}

const themeColorMap: Record<string, { bg: string; border: string; dot: string; bgDark: string; borderDark: string }> = {
  'purple-500': { bg: 'bg-purple-50', border: 'border-l-purple-500', dot: 'bg-purple-500', bgDark: 'bg-gray-700', borderDark: 'border-l-purple-500' },
  'blue-500': { bg: 'bg-blue-50', border: 'border-l-blue-500', dot: 'bg-blue-500', bgDark: 'bg-gray-700', borderDark: 'border-l-blue-500' },
  'green-500': { bg: 'bg-green-50', border: 'border-l-green-500', dot: 'bg-green-500', bgDark: 'bg-gray-700', borderDark: 'border-l-green-500' },
  'orange-500': { bg: 'bg-orange-50', border: 'border-l-orange-500', dot: 'bg-orange-500', bgDark: 'bg-gray-700', borderDark: 'border-l-orange-500' },
  'pink-500': { bg: 'bg-pink-50', border: 'border-l-pink-500', dot: 'bg-pink-500', bgDark: 'bg-gray-700', borderDark: 'border-l-pink-500' },
}

// ─── 쿼드 아바타 컴포넌트 ────────────────────────────────────────────
function GroupAvatarGrid({ participants, isDark }: { participants: Participant[]; isDark: boolean }) {
  const members = participants.slice(0, 4)
  const count = members.length

  const cellBase = `flex items-center justify-center text-sm font-medium overflow-hidden select-none ${isDark ? 'bg-gray-600' : 'bg-gray-300'
    }`

  if (count === 0) {
    return (
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
        👥
      </div>
    )
  }

  if (count === 1) {
    return (
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
        {members[0].avatar || '👤'}
      </div>
    )
  }

  if (count === 2) {
    return (
      <div className="w-12 h-12 rounded-xl overflow-hidden grid grid-cols-2 gap-[1px]">
        {members.map((m) => (
          <div key={m.uuid} className={`${cellBase}`}>
            {m.avatar || '👤'}
          </div>
        ))}
      </div>
    )
  }

  // 3 or 4 → 4분할 (없는 칸은 빈 칸)
  return (
    <div className="w-12 h-12 rounded-xl overflow-hidden grid grid-cols-2 gap-[1px]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`${cellBase} text-xs`}>
          {members[i]?.avatar || (members[i] ? '👤' : '')}
        </div>
      ))}
    </div>
  )
}

// ─── 1:1 아바타 ─────────────────────────────────────────────────────
function SingleAvatar({ avatar, isOnline, isDark }: { avatar: string; isOnline?: boolean; isDark: boolean }) {
  return (
    <div className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 shadow-sm ${isDark ? 'bg-gray-700' : 'bg-gray-200'
      }`}>
      {avatar}
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
      )}
    </div>
  )
}

// ─── 메인 ────────────────────────────────────────────────────────────
export default function ConversationList({
  conversation,
  isSelected,
  onSelect,
  themeAccent,
  isDark,
  fontSize,
  isOnline,
}: ConversationListProps) {
  const colors = themeColorMap[themeAccent] || themeColorMap['purple-500']
  const nameSizeClass = fontSize === 'sm' ? 'text-[13px]' : fontSize === 'lg' ? 'text-base' : 'text-sm'

  const ts = conversation.lastTimestamp
  const now = new Date()
  let timeString = ''
  if (ts instanceof Date && !isNaN(ts.getTime())) {
    const isToday = ts.toDateString() === now.toDateString()
    if (isToday) {
      timeString = ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true })
    } else {
      const diffDays = Math.floor((now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays === 1) timeString = '어제'
      else if (diffDays < 7) timeString = ts.toLocaleDateString('ko-KR', { weekday: 'short' })
      else timeString = ts.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    }
  }

  const participantCount = conversation.participants?.length ?? 0

  return (
    <button
      onClick={onSelect}
      className={`w-full px-4 py-3.5 transition-all text-left border-l-[3px] ${isSelected
          ? `${isDark ? colors.bgDark : colors.bg} ${colors.border}`
          : `${isDark ? 'hover:bg-gray-800/60' : 'hover:bg-gray-100/70'} border-l-transparent`
        }`}
    >
      <div className="flex items-center gap-3">
        {/* ── 아바타 영역 ── */}
        <div className="flex-shrink-0">
          {conversation.isGroup && conversation.participants ? (
            <GroupAvatarGrid participants={conversation.participants} isDark={isDark} />
          ) : (
            <SingleAvatar avatar={conversation.avatar} isOnline={isOnline} isDark={isDark} />
          )}
        </div>

        {/* ── 텍스트 영역 ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <h3 className={`${nameSizeClass} font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'} flex items-center gap-1.5`}>
              {conversation.username}
              {conversation.isGroup && participantCount > 0 && (
                <span className={`text-[11px] font-semibold flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {participantCount}
                </span>
              )}
            </h3>
            <span className={`text-[11px] whitespace-nowrap flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {timeString}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[12px] truncate leading-tight ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {conversation.lastMessage}
            </p>
            {conversation.unreadCount > 0 && (
              <div className={`min-w-[20px] h-5 px-1.5 rounded-full ${colors.dot} text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0`}>
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
