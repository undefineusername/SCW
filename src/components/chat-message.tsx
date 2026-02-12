import { motion } from 'framer-motion'

interface Message {
  id: string
  text: string
  sender: 'user' | 'other'
  timestamp: Date
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  isEcho?: boolean
}

interface ChatMessageProps {
  message: Message
  isDark: boolean
  fontSize: 'sm' | 'md' | 'lg'
}

export default function ChatMessage({ message, isDark, fontSize }: ChatMessageProps) {
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
            Sender
          </span>
        )}

        <div className={`flex items-end gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`rounded-xl px-3 py-2 shadow-sm relative ${isUser ? userBg : `${otherBg} border`}`}>
            <p className={`${textSizeClass} break-words leading-snug`}>{message.text}</p>
          </div>

          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
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
