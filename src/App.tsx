import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Settings, LogOut, Lock as LockIcon, UserPlus, ShieldAlert, X as XIcon } from 'lucide-react'
import ChatMessage, { DateDivider } from '@/components/chat/chat-message'
import ConversationList from '@/components/chat/conversation-list'
import ChatHeader from '@/components/chat/chat-header'
import SettingsModal from '@/components/shared/settings-modal'
import AuthScreen from '@/components/auth/auth-screen'
import { useChat, DECRYPTION_ERROR_MSG, NO_KEY_ERROR_MSG } from '@/hooks/chat/use-chat'
import { db } from '@/lib/db'
import { decryptMessage, deriveKeyFromSecret } from '@/lib/crypto'
import { useLiveQuery } from 'dexie-react-hooks'
import { getServerTime } from '@/lib/time'
import { motion } from 'framer-motion'
import Navigation from '@/components/shared/navigation'
import FriendsList from '@/components/chat/friends-list'
import { useCall } from '@/hooks/call/use-call'
import CallOverlay from '@/components/call/call-overlay'
import IncomingCallDialog from '@/components/call/incoming-call-dialog'

type Theme = 'purple' | 'blue' | 'green' | 'orange' | 'pink'

const themeColors: Record<Theme, { bg: string; accent: string; light: string }> = {
  purple: { bg: 'from-purple-500 to-purple-600', accent: 'purple-500', light: 'purple-50' },
  blue: { bg: 'from-blue-500 to-blue-600', accent: 'blue-500', light: 'blue-50' },
  green: { bg: 'from-green-500 to-green-600', accent: 'green-500', light: 'green-50' },
  orange: { bg: 'from-orange-500 to-orange-600', accent: 'orange-500', light: 'orange-50' },
  pink: { bg: 'from-pink-500 to-pink-600', accent: 'pink-500', light: 'pink-50' },
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('chat-theme') as Theme) || 'purple')
  const [isDark, setIsDark] = useState(() => localStorage.getItem('chat-dark-mode') === 'true')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>(() => (localStorage.getItem('chat-font-size') as 'sm' | 'md' | 'lg') || 'md')
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif'>(() => (localStorage.getItem('chat-font-family') as 'sans' | 'serif') || 'sans')

  const [currentUser, setCurrentUser] = useState<{ uuid: string; key: Uint8Array; username: string; avatar?: string; salt?: string; kdfParams?: any } | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'friends' | 'chats' | 'settings'>('chats')
  const [inputValue, setInputValue] = useState('')
  const [replyingTo, setReplyingTo] = useState<any | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  // Check for Invite Link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      setPendingInviteCode(code);
      setActiveTab('friends');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
              avatar: account.avatar,
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

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('chat-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('chat-dark-mode', String(isDark))
    // Also toggle the 'dark' class on the document for Tailwind's dark: utilities
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  useEffect(() => {
    localStorage.setItem('chat-font-size', fontSize)
  }, [fontSize])

  useEffect(() => {
    localStorage.setItem('chat-font-family', fontFamily)
  }, [fontFamily])

  const handleAuthenticated = (uuid: string, key: Uint8Array, username: string, avatar?: string, salt?: string, kdfParams?: any) => {
    localStorage.setItem(`key_${uuid}`, JSON.stringify(Array.from(key)));
    setCurrentUser({ uuid, key, username, avatar, salt, kdfParams });
  };

  const handleUpdateAvatar = async (newAvatar: string) => {
    if (currentUser) {
      await db.accounts.update(currentUser.uuid, { avatar: newAvatar });
      setCurrentUser(prev => prev ? { ...prev, avatar: newAvatar } : null);
    }
  };


  const {
    // State
    localStream,
    peers,
    isMuted: isCallMuted,
    isCameraOn,
    isCallActive,
    incomingCall: webRTCIncomingCall, // Rename to avoid conflict with local state if any, though we should remove local state

    // Actions
    joinCall,
    leaveCall,
    acceptCall,
    rejectCall,
    toggleMute,
    toggleCamera
  } = useCall(currentUser?.uuid || null);

  // We don't need local incomingCall state anymore, use the one from the hook!
  // But let's check generic "IncomingCallDialog" usage. 
  // It uses `incomingCall` object { from, type, signal }.
  // The hook returns `incomingCall` with same shape!

  const { isConnected, sendMessage, presence } = useChat(
    currentUser,
    selectedConversation,
    undefined, // No signal handler needed
    undefined  // No participants list handler needed
  );


  const conversations = useLiveQuery(() => db.conversations.toArray()) || [];
  const friends = useLiveQuery(() => db.friends.toArray()) || [];
  const messages = useLiveQuery(
    async () => {
      if (!selectedConversation) return [];
      const conv = await db.conversations.get(selectedConversation);
      if (conv?.isGroup) {
        return db.messages.where('groupId').equals(selectedConversation).sortBy('timestamp');
      } else {
        // 1:1 Chat: filter by from/to and ensure groupId is NOT present
        return db.messages
          .where('from').equals(selectedConversation)
          .or('to').equals(selectedConversation)
          .filter(msg => !msg.groupId)
          .sortBy('timestamp');
      }
    },
    [selectedConversation]
  ) || [] as any[];

  // ── useMemo: 날짜 구분선 삽입 + 연속 메시지 그룹핑 ──────────────────
  const processedMessages = useMemo(() => {
    if (!messages.length) return [];

    const result: any[] = [];
    let lastDateStr = ''
    let lastSender = ''

    messages.forEach((msg: any, idx: number) => {
      const ts: Date = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
      const dateStr = ts.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
      const minuteStr = `${msg.from || msg.to}_${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}_${ts.getHours()}-${ts.getMinutes()}`

      // 날짜 구분선
      if (dateStr !== lastDateStr) {
        result.push({ type: 'date', date: dateStr, id: `date-${dateStr}` })
        lastDateStr = dateStr
        lastSender = ''
      }

      const nextMsg = messages[idx + 1]
      const nextTs = nextMsg ? (nextMsg.timestamp instanceof Date ? nextMsg.timestamp : new Date(nextMsg.timestamp)) : null
      const nextMinuteStr = nextMsg ? `${nextMsg.from || nextMsg.to}_${nextTs!.getFullYear()}-${nextTs!.getMonth()}-${nextTs!.getDate()}_${nextTs!.getHours()}-${nextTs!.getMinutes()}` : ''
      const nextSender = nextMsg?.from

      const isContinuation = msg.from === lastSender
      const isFirst = !isContinuation
      const isLast = nextSender !== msg.from || nextMinuteStr !== minuteStr

      result.push({ ...msg, _isFirst: isFirst, _isLast: isLast, _showUnread: isLast })

      lastSender = msg.from
    })

    return result
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (inputValue.trim() && selectedConversation) {
      const replyMetadata = replyingTo ? {
        id: replyingTo.id,
        text: replyingTo.text,
        sender: replyingTo.isEcho ? '나' : (conversations.find((c: any) => c.id === selectedConversation)?.username || '상대방')
      } : undefined;

      await sendMessage(selectedConversation, inputValue, replyMetadata);
      setInputValue('')
      setReplyingTo(null)
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
        lastTimestamp: getServerTime(),
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

  const handleAcceptFriend = async (uuid: string) => {
    const friend = await db.friends.get(uuid);
    const username = friend?.username || conversations.find((c: any) => c.id === uuid)?.username || 'Unknown';

    await db.friends.put({
      uuid,
      username,
      status: 'friend',
      isBlocked: false
    });

    // 1. Send FRIEND_ACCEPT
    await sendMessage(uuid, JSON.stringify({
      system: true,
      type: 'FRIEND_ACCEPT',
      username: currentUser?.username
    }));

    // 2. Send automatic PING to confirm E2EE and sync keys
    await sendMessage(uuid, JSON.stringify({
      system: true,
      type: 'E2EE_PING',
      username: currentUser?.username
    }));
  };

  const handleBlockUser = async (uuid: string) => {
    if (confirm('Block this user? You will no longer see their messages.')) {
      const friend = await db.friends.get(uuid);
      await db.friends.put({
        uuid,
        username: friend?.username || 'Stranger',
        status: 'blocked',
        isBlocked: true
      });
      await db.conversations.delete(uuid);
      setSelectedConversation(null);
    }
  };

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
        pendingRequestsCount={friends.filter(f => f.status === 'pending_incoming').length}
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
            sendMessage={sendMessage}
            pendingInviteCode={pendingInviteCode}
            onClearInvite={() => setPendingInviteCode(null)}
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
              {conversations.sort((a: any, b: any) => {
                const ta = a.lastTimestamp instanceof Date ? a.lastTimestamp.getTime() : new Date(a.lastTimestamp).getTime()
                const tb = b.lastTimestamp instanceof Date ? b.lastTimestamp.getTime() : new Date(b.lastTimestamp).getTime()
                return tb - ta
              }).map((conversation: any) => (
                <ConversationList
                  key={conversation.id}
                  conversation={{
                    ...conversation,
                    lastTimestamp: conversation.lastTimestamp instanceof Date ? conversation.lastTimestamp : new Date(conversation.lastTimestamp)
                  }}
                  isSelected={selectedConversation === conversation.id}
                  onSelect={() => {
                    setSelectedConversation(conversation.id);
                    db.conversations.update(conversation.id, { unreadCount: 0 });
                  }}
                  themeAccent={colors.accent}
                  isDark={isDark}
                  fontSize={fontSize}
                  isOnline={presence[conversation.id] === 'online'}
                />
              ))}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className={`flex flex-col h-full ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <h2 className={`text-xl font-bold p-5 ${isDark ? 'text-white' : 'text-gray-900'}`}>Settings</h2>

            <div className="flex-1 overflow-y-auto px-5 space-y-6">
              {/* Profile Summary in Sidebar */}
              <div className={`p-4 rounded-2xl flex items-center gap-4 ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-white shadow-sm'}`}>
                  {currentUser?.avatar?.startsWith('data:image') ? (
                    <img src={currentUser.avatar} alt="Me" className="w-full h-full object-cover" />
                  ) : (
                    currentUser?.avatar || '👤'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{currentUser?.username}</p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">{currentUser?.uuid}</p>
                </div>
              </div>

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
              isOnline={presence[selectedConversation] === 'online'}
              isGroup={conversations.find((c: any) => c.id === selectedConversation)?.isGroup}
              participants={(conversations.find((c: any) => c.id === selectedConversation)?.participants || []) as any[]}
              onVoiceCall={async () => {
                const group = conversations.find((c: any) => c.id === selectedConversation);
                if (group) {
                  await joinCall(selectedConversation, 'voice');
                }
              }}
              onVideoCall={async () => {
                const group = conversations.find((c: any) => c.id === selectedConversation);
                if (group) {
                  await joinCall(selectedConversation, 'video');
                }
              }}
            />

            {/* Stranger Banner (O/X) */}
            {(() => {
              const friend = friends.find((f: any) => f.uuid === selectedConversation);
              const isFriend = friend?.status === 'friend';
              const conversation = conversations.find((c: any) => c.id === selectedConversation);
              const isGroup = conversation?.isGroup;

              if (selectedConversation && !isFriend && !isGroup) {
                return (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className={`px-6 py-4 border-b flex items-center justify-between z-10 ${isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-blue-100 text-gray-900'} shadow-lg sticky top-0`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-blue-50'}`}>
                        <ShieldAlert size={20} className="text-blue-500" />
                      </div>
                      <div>
                        <p className="text-[13px] font-black uppercase tracking-tight">Unknown Contact</p>
                        <p className={`text-[11px] font-medium leading-tight ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Add this person to chat securely or block them to ignore.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptFriend(selectedConversation)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-500/20`}
                      >
                        <UserPlus size={14} />
                        Add (O)
                      </button>
                      <button
                        onClick={() => handleBlockUser(selectedConversation)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDark ? 'bg-gray-800 text-gray-400 hover:text-red-400' : 'bg-white text-gray-500 hover:text-red-500 border border-gray-200 shadow-sm'} active:scale-95`}
                      >
                        <ShieldAlert size={14} />
                        Block (X)
                      </button>
                    </div>
                  </motion.div>
                );
              }
              return null;
            })()}

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto py-3 ${isDark ? 'bg-gray-900' : 'bg-[#B2C7D9]'}`}>
              {processedMessages
                .filter(item => {
                  if (item.type === 'date') return true;
                  // Hide decryption error messages
                  return item.text !== DECRYPTION_ERROR_MSG && item.text !== NO_KEY_ERROR_MSG;
                })
                .map((item: any) => {
                  // 날짜 구분선
                  if (item.type === 'date') {
                    return <DateDivider key={item.id} date={item.date} isDark={isDark} />
                  }

                  const conv = conversations.find((c: any) => c.id === selectedConversation)
                  const isGroupChat = conv?.isGroup
                  const isMyMsg = item.isEcho || item.from === currentUser?.uuid
                  const senderFriend = friends.find((f: any) => f.uuid === item.from)

                  return (
                    <ChatMessage
                      key={item.msgId || item.id}
                      message={{
                        id: item.msgId,
                        text: item.text,
                        sender: isMyMsg ? 'user' : 'other',
                        timestamp: item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp),
                        status: item.status,
                        isEcho: item.isEcho,
                        replyToText: item.replyToText,
                        replyToSender: item.replyToSender,
                        senderName: isMyMsg ? '나' : (senderFriend?.username || (item.from ? `User-${item.from.slice(0, 4)}` : '상대방')),
                        senderAvatar: isMyMsg ? '' : (senderFriend?.avatar || '👤'),
                        type: item.type === 'system' ? 'system' : 'text',
                      }}
                      isDark={isDark}
                      fontSize={fontSize}
                      onReply={(msg) => setReplyingTo(msg)}
                      isGroup={isGroupChat}
                      isFirstInGroup={item._isFirst}
                      isLastInGroup={item._isLast}
                      showTime={item._isLast}
                      showUnread={item._showUnread}
                    />
                  )
                })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className={`px-3 py-3 border-t ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              {replyingTo && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-2 px-3 py-2 rounded-xl border-l-4 flex items-center justify-between ${isDark ? 'bg-gray-700 border-purple-500' : 'bg-gray-50 border-purple-500'}`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider mb-0.5">답장</p>
                    <p className={`text-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {replyingTo.text}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className={`p-1 rounded-full ${isDark ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                  >
                    <XIcon size={14} />
                  </button>
                </motion.div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="메시지 입력..."
                  rows={1}
                  className={`flex-1 px-4 py-2.5 border rounded-2xl focus:outline-none transition-all resize-none overflow-y-auto max-h-28 ${isDark
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-gray-500'
                    : 'bg-gray-100 border-transparent text-gray-800 placeholder-gray-400 focus:bg-white focus:border-gray-300'
                    }`}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  className={`p-2.5 bg-gradient-to-r ${colors.bg} text-white rounded-full hover:opacity-90 active:scale-95 transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-40`}
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
        avatar={currentUser?.avatar}
        onUpdateAvatar={handleUpdateAvatar}
      />

      {/* Call UI */}
      {/* Call UI */}
      <CallOverlay
        isOpen={isCallActive}
        callType={isCameraOn ? 'video' : 'voice'}
        peers={Object.entries(peers).reduce((acc, [uuid, peer]) => {
          const friend = friends.find((f: any) => f.uuid === uuid);
          const conv = conversations.find((c: any) => c.id === uuid);
          // For group members, we need to find them in the participants list of the group conversation
          // This is a bit complex if we are in a group call but don't know WHICH group it is easily without tracking it separately 
          // (though activeGroupIdRef is internal).
          // But here we can try to look up in friends or conversations.
          // Or we can try to find them in the currently selected conversation if it matches?
          // Fallback: Unknown

          acc[uuid] = {
            ...peer,
            username: friend?.username || conv?.username || `User ${uuid.slice(0, 4)}`,
            avatar: friend?.avatar || conv?.avatar
          };
          return acc;
        }, {} as any)}
        localStream={localStream}
        isMuted={isCallMuted}
        isCameraOn={isCameraOn}
        isLocalSpeaking={false} // Todo: expose from hook
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onLeave={leaveCall}
        isDark={isDark}
        groupName={conversations.find((c: any) => c.id === (selectedConversation))?.username || 'Group Call'}
      />

      <IncomingCallDialog
        isOpen={!!webRTCIncomingCall}
        callerName={conversations.find((c: any) => c.id === webRTCIncomingCall?.from)?.username || friends.find((f: any) => f.uuid === webRTCIncomingCall?.from)?.username || 'Unknown Caller'}
        callerAvatar={conversations.find((c: any) => c.id === webRTCIncomingCall?.from)?.avatar || friends.find((f: any) => f.uuid === webRTCIncomingCall?.from)?.avatar}
        onAccept={async () => {
          if (webRTCIncomingCall) {
            await acceptCall();
          }
        }}
        onReject={() => {
          rejectCall();
        }}
        isDark={isDark}
        callType={webRTCIncomingCall?.type || 'video'}
      />
    </div >
  )
}
