'use client';

import { Phone, Video, Lock, Check, X } from 'lucide-react'
import { useState } from 'react'

interface ChatHeaderProps {
  name: string
  avatar: string
  themeAccent: string
  isDark: boolean
  fontSize: 'sm' | 'md' | 'lg'
  secret?: string
  onSecretChange: (secret: string) => void
}

const themeColorMap: Record<string, { hover: string; hoverDark: string; icon: string; iconDark: string }> = {
  'purple-500': { hover: 'hover:bg-purple-50', hoverDark: 'hover:bg-gray-700', icon: 'text-purple-600', iconDark: 'text-purple-400' },
  'blue-500': { hover: 'hover:bg-blue-50', hoverDark: 'hover:bg-gray-700', icon: 'text-blue-600', iconDark: 'text-blue-400' },
  'green-500': { hover: 'hover:bg-green-50', hoverDark: 'hover:bg-gray-700', icon: 'text-green-600', iconDark: 'text-green-400' },
  'orange-500': { hover: 'hover:bg-orange-50', hoverDark: 'hover:bg-gray-700', icon: 'text-orange-600', iconDark: 'text-orange-400' },
  'pink-500': { hover: 'hover:bg-pink-50', hoverDark: 'hover:bg-gray-700', icon: 'text-pink-600', iconDark: 'text-pink-400' },
}

export default function ChatHeader({ name, avatar, themeAccent, isDark, fontSize, secret, onSecretChange }: ChatHeaderProps) {
  const [isEditingSecret, setIsEditingSecret] = useState(false)
  const [tempSecret, setTempSecret] = useState(secret || '')

  const textSizeClass = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base'
  const colors = themeColorMap[themeAccent] || themeColorMap['purple-500']
  const hoverClass = isDark ? colors.hoverDark : colors.hover
  const iconClass = isDark ? colors.iconDark : colors.icon

  const handleSaveSecret = () => {
    onSecretChange(tempSecret)
    setIsEditingSecret(false)
  }

  return (
    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-medium ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
            {avatar}
          </div>
          <div>
            <h2 className={`${textSizeClass} font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{name}</h2>
            <div className="flex items-center gap-1">
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Active now</p>
              <div className={`w-1 h-1 rounded-full ${secret ? 'bg-green-500' : 'bg-gray-400'}`} />
              {secret && <span className="text-[10px] text-green-500 font-bold uppercase tracking-tighter">E2EE Locked</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isEditingSecret ? (
            <div className={`flex items-center gap-2 px-2 py-1 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
              <input
                type="password"
                value={tempSecret}
                onChange={(e) => setTempSecret(e.target.value)}
                placeholder="Chat Secret"
                className="bg-transparent text-xs outline-none w-24"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveSecret()}
              />
              <button onClick={handleSaveSecret} className="text-green-500 hover:scale-110 transition-transform">
                <Check size={14} />
              </button>
              <button onClick={() => setIsEditingSecret(false)} className="text-red-400 hover:scale-110 transition-transform">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingSecret(true)}
              className={`p-2 rounded-lg transition-colors ${hoverClass} flex items-center gap-2 group`}
              title="Set Chat Secret (E2EE)"
            >
              <Lock size={18} className={secret ? 'text-green-500' : iconClass} />
              {!secret && <span className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">SET E2EE KEY</span>}
            </button>
          )}
          <button className={`p-2 rounded-lg transition-colors ${hoverClass}`}>
            <Phone size={18} className={iconClass} />
          </button>
          <button className={`p-2 rounded-lg transition-colors ${hoverClass}`}>
            <Video size={18} className={iconClass} />
          </button>
        </div>
      </div>
    </div>
  )
}
