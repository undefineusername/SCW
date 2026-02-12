'use client';

interface Conversation {
  id: string
  username: string
  avatar: string
  lastMessage: string
  lastTimestamp: Date
  unreadCount: number
}

interface ConversationListProps {
  conversation: Conversation
  isSelected: boolean
  onSelect: () => void
  themeAccent: string
  isDark: boolean
  fontSize: 'sm' | 'md' | 'lg'
}

const themeColorMap: Record<string, { bg: string; border: string; dot: string; bgDark: string; borderDark: string }> = {
  'purple-500': { bg: 'bg-purple-50', border: 'border-l-purple-500', dot: 'bg-purple-500', bgDark: 'bg-gray-700', borderDark: 'border-l-purple-500' },
  'blue-500': { bg: 'bg-blue-50', border: 'border-l-blue-500', dot: 'bg-blue-500', bgDark: 'bg-gray-700', borderDark: 'border-l-blue-500' },
  'green-500': { bg: 'bg-green-50', border: 'border-l-green-500', dot: 'bg-green-500', bgDark: 'bg-gray-700', borderDark: 'border-l-green-500' },
  'orange-500': { bg: 'bg-orange-50', border: 'border-l-orange-500', dot: 'bg-orange-500', bgDark: 'bg-gray-700', borderDark: 'border-l-orange-500' },
  'pink-500': { bg: 'bg-pink-50', border: 'border-l-pink-500', dot: 'bg-pink-500', bgDark: 'bg-gray-700', borderDark: 'border-l-pink-500' },
}

export default function ConversationList({
  conversation,
  isSelected,
  onSelect,
  themeAccent,
  isDark,
  fontSize,
}: ConversationListProps) {
  const colors = themeColorMap[themeAccent] || themeColorMap['purple-500']
  const nameSizeClass = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base'

  const timeString = conversation.lastTimestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  return (
    <button
      onClick={onSelect}
      className={`w-full px-5 py-4 transition-all text-left border-l-4 ${isSelected
        ? `${isDark ? colors.bgDark : colors.bg} ${colors.border}`
        : `${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} border-l-transparent`
        }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-medium flex-shrink-0 shadow-sm ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
          {conversation.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className={`${nameSizeClass} font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{conversation.username}</h3>
            <span className={`text-[10px] whitespace-nowrap ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {timeString}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm truncate leading-tight ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{conversation.lastMessage}</p>
            {conversation.unreadCount > 0 && (
              <div className={`min-w-[18px] h-[18px] px-1.5 rounded-full ${colors.dot} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 animate-in zoom-in-50 duration-200`}>
                {conversation.unreadCount}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
