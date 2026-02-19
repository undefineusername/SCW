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
}

interface ChatMessageProps {
  message: Message
  isDark: boolean
  fontSize: 'sm' | 'md' | 'lg'
  onReply?: (message: Message) => void
}

export default function ChatMessage({ message, isDark, fontSize, onReply }: ChatMessageProps) {
  const isUser = message.sender === 'user'

  const textSizeClass = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base'

  const timeString = message.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  // Kakao Colors
  const userBg = isDark ? 'bg-[#FEE500] text-black' : 'bg-[#FEE500] text-black'
  const otherBg = isDark ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-100'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, x: isUser ? 20 : -20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 px-1`}
    >
      {!isUser && (
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg mr-2 flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
          👤
        </div>
      )}

      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[75%]`}>
        {!isUser && (
          <span className={`text-[11px] font-semibold mb-1 ml-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {message.senderName || '상대방'}
          </span>
        )}

        <div className={`group flex items-end gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`rounded-xl px-3 py-2 shadow-sm relative ${isUser ? userBg : `${otherBg} border`}`}>
            {message.replyToText && (
              <div className={`mb-1 p-2 rounded-lg text-[11px] border-l-2 ${isDark ? 'bg-black/20 border-gray-500 text-gray-400' : 'bg-black/5 border-gray-300 text-gray-500'} italic line-clamp-2`}>
                <span className="font-bold block not-italic opacity-70 mb-0.5">{message.replyToSender === message.id ? '나' : (message.replyToSender || '상대방')}에게 답장</span>
                {message.replyToText}
              </div>
            )}
            <p className={`${textSizeClass} break-words leading-snug`}>{message.text}</p>
          </div>

          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
            {onReply && (
              <button
                onClick={() => onReply(message)}
                className={`opacity-0 group-hover:opacity-100 p-1 rounded-full transition-opacity ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                title="Reply"
              >
                <motion.span whileTap={{ scale: 0.8 }}>↩️</motion.span>
              </button>
            )}
            {message.status !== 'read' && isUser && (
              <span className="text-[10px] font-bold text-[#FEE500] leading-none">1</span>
            )}
            <span className={`text-[9px] ${isDark ? 'text-gray-600' : 'text-gray-400'} whitespace-nowrap`}>
              {timeString}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
