import { useState, useRef, useEffect } from 'react'
import { Send, Settings, LogOut, Lock as LockIcon } from 'lucide-react'
import ChatMessage from '@/components/chat-message'
import ConversationList from '@/components/conversation-list'
import ChatHeader from '@/components/chat-header'
import SettingsModal from '@/components/settings-modal'
import AuthScreen from '@/components/auth-screen'
import { useChat, DECRYPTION_ERROR_MSG, NO_KEY_ERROR_MSG } from '@/hooks/use-chat'
import { db } from '@/lib/db'
import { decryptMessage, deriveKeyFromSecret } from '@/lib/crypto'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import Navigation from '@/components/navigation'
import FriendsList from '@/components/friends-list'

type Theme = 'purple' | 'blue' | 'green' | 'orange' | 'pink'

const themeColors: Record<Theme, { bg: string; accent: string; light: string }> = {
  purple: { bg: 'from-purple-500 to-purple-600', accent: 'purple-500', light: 'purple-50' },
  blue: { bg: 'from-blue-500 to-blue-600', accent: 'blue-500', light: 'blue-50' },
  green: { bg: 'from-green-500 to-green-600', accent: 'green-500', light: 'green-50' },
  orange: { bg: 'from-orange-500 to-orange-600', accent: 'orange-500', light: 'orange-50' },
  pink: { bg: 'from-pink-500 to-pink-600', accent: 'pink-500', light: 'pink-50' },
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('purple')
  const [isDark, setIsDark] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif'>('sans')

  const [currentUser, setCurrentUser] = useState<{ uuid: string; key: Uint8Array; username: string; salt?: string; kdfParams?: any } | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'friends' | 'chats' | 'settings'>('chats')
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load user from DB on mount (Persistence)
  useEffect(() => {
    const loadUser = async () => {
      const account = await db.accounts.toCollection().first();
      if (account) {
        // Try to get key from localStorage for auto-login
        const storedKey = localStorage.getItem(`key_${account.id}`);
        if (storedKey) {
          try {
            const keyArray = new Uint8Array(JSON.parse(storedKey));
            setCurrentUser({
              uuid: account.id,
              key: keyArray,
              username: account.username,
              salt: account.salt,
              kdfParams: account.kdfParams
            });
          } catch (e) {
            console.error("Failed to parse auto-login key", e);
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      }
    };
    loadUser();
  }, []);

  const handleAuthenticated = (uuid: string, key: Uint8Array, username: string, salt?: string, kdfParams?: any) => {
    localStorage.setItem(`key_${uuid}`, JSON.stringify(Array.from(key)));
    setCurrentUser({ uuid, key, username, salt, kdfParams });
  };

  const { isConnected, sendMessage } = useChat(
    currentUser,
    selectedConversation
  );

  const conversations = useLiveQuery(() => db.conversations.toArray()) || [];
  const messages = useLiveQuery(
    () => selectedConversation ? db.messages.where('from').equals(selectedConversation).or('to').equals(selectedConversation).sortBy('timestamp') : Promise.resolve([] as any[]),
    [selectedConversation]
  ) || [] as any[];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (inputValue.trim() && selectedConversation) {
      await sendMessage(selectedConversation, inputValue);
      setInputValue('')
    }
  }

  const handleLogout = async () => {
    if (currentUser) {
      localStorage.removeItem(`key_${currentUser.uuid}`);
    }
    await db.accounts.clear();
    setCurrentUser(null);
  };

  const handleNewChat = async (targetUuid: string) => {
    const targetId = targetUuid.trim();

    const exists = await db.conversations.get(targetId);
    if (!exists) {
      await db.conversations.add({
        id: targetId,
        username: `User-${targetId.slice(0, 8)}`,
        avatar: '👤',
        lastMessage: 'Encryption tunnel ready',
        lastTimestamp: new Date(),
        unreadCount: 0
      });
    }
    // 2. Add to Friends List if not exists
    const friendExists = await db.friends.get(targetId);
    if (!friendExists) {
      await db.friends.add({
        uuid: targetId,
        username: `User-${targetId.slice(0, 8)}`,
        avatar: '👤',
        isBlocked: false
      });
    }

    setSelectedConversation(targetId);
    setActiveTab('chats');
  }

  const handleSecretChange = async (newSecret: string) => {
    if (selectedConversation) {
      await db.conversations.update(selectedConversation, { secret: newSecret });

      // Re-decrypt messages that failed previously
      if (newSecret) {
        try {
          const newKey = await deriveKeyFromSecret(newSecret);
          const messagesToRetry = await db.messages
            .where('from').equals(selectedConversation)
            .or('to').equals(selectedConversation)
            .filter(msg =>
              msg.text === DECRYPTION_ERROR_MSG ||
              msg.text === NO_KEY_ERROR_MSG
            )
            .toArray();

          console.log(`🔄 Attempting to re-decrypt ${messagesToRetry.length} messages...`);

          for (const msg of messagesToRetry) {
            if (msg.rawPayload) {
              try {
                const decryptedText = await decryptMessage(new Uint8Array(msg.rawPayload), newKey);
                await db.messages.update(msg.id!, { text: decryptedText });
              } catch (e) {
                console.warn(`Failed to re-decrypt message ${msg.msgId} even with new secret`);
              }
            }
          }

          // Finally update conversation's last message with the latest message from DB
          const latestMsg = await db.messages
            .where('from').equals(selectedConversation)
            .or('to').equals(selectedConversation)
            .reverse()
            .sortBy('timestamp')
            .then(msgs => msgs[0]);

          if (latestMsg) {
            await db.conversations.update(selectedConversation, {
              lastMessage: latestMsg.text,
              lastTimestamp: latestMsg.timestamp
            });
          }
        } catch (err) {
          console.error("Error during re-decryption process:", err);
        }
      }
    }
  }

  const colors = themeColors[theme]
  const fontSizeClass = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' }[fontSize]
  const fontClass = fontFamily === 'serif' ? 'font-serif' : 'font-sans'

  if (!currentUser) {
    return <AuthScreen isDark={isDark} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className={`flex h-screen ${isDark ? 'bg-gray-950 text-gray-100' : 'bg-white text-gray-900'} ${fontClass} ${fontSizeClass}`}>
      {/* 1st Column: Tab Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isDark={isDark}
        themeAccent={colors.accent}
        isConnected={isConnected}
      />

      {/* 2nd Column: List View (Friends or Chats) */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className={`w-80 ${isDark ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50 border-gray-100'} border-r flex flex-col`}
      >
        {activeTab === 'friends' && (
          <FriendsList
            isDark={isDark}
            currentUser={currentUser}
            onNewChat={handleNewChat}
          />
        )}

        {activeTab === 'chats' && (
          <>
            <div className="p-5 flex items-center justify-between">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Chats</h2>
              <button
                onClick={handleLogout}
                className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 && (
                <div className="p-8 text-center space-y-2">
                  <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No active pipelines</p>
                </div>
              )}
              {conversations.sort((a: any, b: any) => b.lastTimestamp - a.lastTimestamp).map((conversation: any) => (
                <ConversationList
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={selectedConversation === conversation.id}
                  onSelect={() => {
                    setSelectedConversation(conversation.id);
                    db.conversations.update(conversation.id, { unreadCount: 0 });
                  }}
                  themeAccent={colors.accent}
                  isDark={isDark}
                  fontSize={fontSize}
                />
              ))}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="flex flex-col h-full bg-white dark:bg-gray-900 font-sans">
            <h2 className={`text-xl font-bold p-5 ${isDark ? 'text-white' : 'text-gray-900'}`}>Settings</h2>

            <div className="flex-1 overflow-y-auto px-5 space-y-6">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2 block">Application</span>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100 border border-gray-100'} transition-colors shadow-sm`}
                >
                  <Settings size={18} className="text-gray-400" />
                  <span className="text-sm font-medium">Appearance & Themes</span>
                </button>
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100 border border-gray-100'} transition-colors shadow-sm text-red-500`}
                >
                  <LogOut size={18} />
                  <span className="text-sm font-medium">Logout Sessions</span>
                </button>
              </div>

              <div className="pt-4 text-center">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">Transparent Kakao v2.5</p>
                <p className="text-[9px] text-gray-400 mt-1">E2EE Protected • Stateless Pipeline</p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <ChatHeader
              name={conversations.find((c: any) => c.id === selectedConversation)?.username || 'Chat'}
              avatar={conversations.find((c: any) => c.id === selectedConversation)?.avatar || ''}
              themeAccent={colors.accent}
              isDark={isDark}
              fontSize={fontSize}
              secret={conversations.find((c: any) => c.id === selectedConversation)?.secret}
              onSecretChange={handleSecretChange}
            />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2 bg-[url('/chat-bg.png')] bg-repeat bg-fixed opacity-95">
              {messages.map((message: any) => (
                <ChatMessage
                  key={message.msgId || message.id}
                  message={{
                    id: message.msgId,
                    text: message.text,
                    sender: message.to === selectedConversation ? 'user' : 'other',
                    timestamp: message.timestamp,
                    status: message.status,
                    isEcho: message.isEcho
                  }}
                  isDark={isDark}
                  fontSize={fontSize}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className={`p-5 border-t ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="E2EE Protected Message..."
                  className={`flex-1 px-4 py-2.5 border rounded-lg focus:outline-none focus:border-gray-300 transition-all ${isDark
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:bg-gray-700 focus:border-gray-500'
                    : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:bg-white focus:border-gray-300'
                    }`}
                />
                <button
                  onClick={handleSendMessage}
                  className={`p-2.5 bg-gradient-to-r ${colors.bg} text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center`}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-12">
            <div className="max-w-xs space-y-4">
              <div className={`w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 mx-auto`}>
                <LockIcon size={32} />
              </div>
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Select a Channel</h2>
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                All messages in this pipeline are protected by Argon2 key derivation and AES-GCM encryption.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={theme}
        onThemeChange={setTheme}
        isDark={isDark}
        onToggleDark={() => setIsDark(!isDark)}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        fontFamily={fontFamily}
        onFontFamilyChange={setFontFamily}
      />
    </div >
  )
}
