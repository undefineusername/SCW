import { motion } from 'framer-motion'

interface Message {
  id: string
  text: string
  sender: 'user' | 'other'
  timestamp: Date
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  isEcho?: boolean
  replyToText?: string
  replyToSender?: string
  senderName?: string
  senderAvatar?: string
  type?: 'text' | 'system'
}

interface ChatMessageProps {
  message: Message
  isDark: boolean
  fontSize: 'sm' | 'md' | 'lg'
  onReply?: (message: Message) => void
  isGroup?: boolean
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  showTime?: boolean
  showUnread?: boolean
}

// 카카오톡 스타일 색상 상수
const KAKAO_YELLOW = '#FEE500'

export default function ChatMessage({
  message,
  isDark,
  fontSize,
  onReply,
  isGroup = false,
  isFirstInGroup = true,
  showTime = true,
  showUnread = false,
}: ChatMessageProps) {
  const isUser = message.sender === 'user'

  const textSizeClass = fontSize === 'sm' ? 'text-xs' : fontSize === 'lg' ? 'text-base' : 'text-sm'

  const timeString = message.timestamp instanceof Date
    ? message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true })
    : ''

  // ─── 시스템 메시지 ───────────────────────────────────────────────
  if (message.type === 'system') {
    return (
      <div className="flex items-center justify-center my-2 px-4">
        <div className={`text-[11px] font-medium px-3 py-1 rounded-full ${isDark ? 'bg-gray-700/80 text-gray-400' : 'bg-gray-200/80 text-gray-500'
          }`}>
          {message.text}
        </div>
      </div>
    )
  }

  // ─── 말풍선 꼬리 모양 ────────────────────────────────────────────
  // isFirstInGroup = 꼬리 있음, 나머지 = 완전 둥근 사각형
  const getBubbleRadius = (isFirst: boolean, isMe: boolean) => {
    if (isFirst) {
      // 첫 번째 메시지: 상대 쪽 위쪽 코너만 뾰족하게
      return isMe
        ? 'rounded-[18px] rounded-tr-[4px]'
        : 'rounded-[18px] rounded-tl-[4px]'
    }
    return 'rounded-[18px]'
  }

  const bubbleRadius = getBubbleRadius(isFirstInGroup, isUser)

  const otherBubble = isDark
    ? 'bg-gray-700 text-white'
    : 'bg-white text-gray-900 border border-gray-100 shadow-sm'

  // 아바타 공간 (그룹일 때 정렬 맞추기용)
  const AVATAR_WIDTH = 'w-[38px]'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, x: isUser ? 10 : -10 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 220 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-3' : 'mt-[2px]'} px-3`}
    >
      {/* ── 상대방 메시지 ── */}
      {!isUser && (
        <>
          {/* 아바타 자리 */}
          <div className={`${AVATAR_WIDTH} flex-shrink-0 flex items-end mr-1.5`}>
            {isGroup && isFirstInGroup ? (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base overflow-hidden select-none ${isDark ? 'bg-gray-600' : 'bg-gray-200'
                }`}>
                {message.senderAvatar || '👤'}
              </div>
            ) : (
              // 연속 메시지면 아바타 자리만 비워둠
              <div className="w-9 h-9" />
            )}
          </div>

          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[68%]`}>
            {/* 발신자 이름 (그룹 + 첫 메시지일 때만) */}
            {isGroup && isFirstInGroup && (
              <span className={`text-[12px] font-semibold mb-1 ml-0.5 ${isDark ? 'text-gray-300' : 'text-gray-600'
                }`}>
                {message.senderName || '상대방'}
              </span>
            )}

            <div className={`group flex items-end gap-1.5 flex-row`}>
              {/* 말풍선 */}
              <div
                className={`${bubbleRadius} px-3 py-2 relative ${otherBubble}`}
                style={{ wordBreak: 'break-word' }}
              >
                {/* 답장 미리보기 */}
                {message.replyToText && (
                  <div className={`mb-1.5 px-2 py-1.5 rounded-lg text-[11px] border-l-2 ${isDark ? 'bg-black/20 border-gray-500 text-gray-400' : 'bg-gray-100 border-gray-300 text-gray-500'
                    } italic`}>
                    <span className="font-bold not-italic block mb-0.5 opacity-70">
                      {message.replyToSender || '상대방'}
                    </span>
                    <span className="line-clamp-2">{message.replyToText}</span>
                  </div>
                )}
                <p className={`${textSizeClass} whitespace-pre-wrap leading-snug`}>{message.text}</p>
              </div>

              {/* 시간 (마지막 메시지에만) + 답장 버튼 */}
              <div className="flex flex-col items-start justify-end gap-0.5 pb-0.5">
                <button
                  onClick={() => onReply?.(message)}
                  className={`opacity-0 group-hover:opacity-100 text-[16px] transition-opacity leading-none`}
                  title="답장"
                >
                  ↩️
                </button>
                {showTime && (
                  <span className={`text-[10px] whitespace-nowrap ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {timeString}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 내 메시지 ── */}
      {isUser && (
        <div className={`flex flex-col items-end max-w-[68%]`}>
          <div className={`group flex items-end gap-1.5 flex-row-reverse`}>
            {/* 말풍선 */}
            <div
              className={`${bubbleRadius} px-3 py-2 relative`}
              style={{ backgroundColor: KAKAO_YELLOW, color: '#000', wordBreak: 'break-word' }}
            >
              {message.replyToText && (
                <div className="mb-1.5 px-2 py-1.5 rounded-lg text-[11px] border-l-2 bg-black/10 border-black/20 text-black/60 italic">
                  <span className="font-bold not-italic block mb-0.5">
                    {message.replyToSender || '나'}
                  </span>
                  <span className="line-clamp-2">{message.replyToText}</span>
                </div>
              )}
              <p className={`${textSizeClass} whitespace-pre-wrap leading-snug`}>{message.text}</p>
            </div>

            {/* 시간 + 읽음 수 */}
            <div className="flex flex-col items-end justify-end gap-0.5 pb-0.5">
              <button
                onClick={() => onReply?.(message)}
                className={`opacity-0 group-hover:opacity-100 text-[16px] transition-opacity leading-none`}
                title="답장"
              >
                ↩️
              </button>
              {showUnread && message.status !== 'read' && (
                <span className="text-[11px] font-bold text-[#FEE500] leading-none">1</span>
              )}
              {showTime && (
                <span className={`text-[10px] whitespace-nowrap ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {timeString}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ──────────────────────────────────────────────
// 날짜 구분선 컴포넌트
// ──────────────────────────────────────────────
export function DateDivider({ date, isDark }: { date: string; isDark: boolean }) {
  return (
    <div className="flex items-center gap-3 my-4 px-6">
      <div className={`flex-1 h-px ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
      <span className={`text-[11px] font-semibold px-3 py-1 rounded-full whitespace-nowrap ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
        }`}>
        {date}
      </span>
      <div className={`flex-1 h-px ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
    </div>
  )
}
