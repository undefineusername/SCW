'use client'

import { X, Palette, Moon, Sun, Type } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentTheme: 'purple' | 'blue' | 'green' | 'orange' | 'pink'
  onThemeChange: (theme: 'purple' | 'blue' | 'green' | 'orange' | 'pink') => void
  isDark: boolean
  onToggleDark: () => void
  fontSize: 'sm' | 'md' | 'lg'
  onFontSizeChange: (size: 'sm' | 'md' | 'lg') => void
  fontFamily: 'sans' | 'serif'
  onFontFamilyChange: (family: 'sans' | 'serif') => void
}

const themes = [
  { id: 'purple' as const, color: 'bg-purple-500', label: 'Purple' },
  { id: 'blue' as const, color: 'bg-blue-500', label: 'Blue' },
  { id: 'green' as const, color: 'bg-green-500', label: 'Green' },
  { id: 'orange' as const, color: 'bg-orange-500', label: 'Orange' },
  { id: 'pink' as const, color: 'bg-pink-500', label: 'Pink' },
]

const fontSizes = [
  { id: 'sm' as const, label: 'Small', size: '14px' },
  { id: 'md' as const, label: 'Medium', size: '16px' },
  { id: 'lg' as const, label: 'Large', size: '18px' },
]

const fontFamilies = [
  { id: 'sans' as const, label: 'Sans', class: 'font-sans' },
  { id: 'serif' as const, label: 'Serif', class: 'font-serif' },
]

export default function SettingsModal({
  isOpen,
  onClose,
  currentTheme,
  onThemeChange,
  isDark,
  onToggleDark,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
}: SettingsModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative w-full max-w-md mx-4 rounded-xl shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Settings</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Color Theme */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Palette size={18} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Color Theme
              </h3>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => onThemeChange(theme.id)}
                  className={`w-full aspect-square rounded-lg transition-all ${theme.color} ${
                    currentTheme === theme.id
                      ? `ring-2 ring-offset-2 ${isDark ? 'ring-offset-gray-800 ring-white' : 'ring-offset-white ring-gray-400'}`
                      : 'hover:opacity-80'
                  }`}
                  title={theme.label}
                />
              ))}
            </div>
          </div>

          {/* Dark Mode */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {isDark ? <Moon size={18} className="text-blue-400" /> : <Sun size={18} className="text-yellow-600" />}
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Dark Mode
                </h3>
              </div>
              <button
                onClick={onToggleDark}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isDark
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {isDark ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Font Size */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Type size={18} className={isDark ? 'text-green-400' : 'text-green-600'} />
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Text Size
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {fontSizes.map((size) => (
                <button
                  key={size.id}
                  onClick={() => onFontSizeChange(size.id)}
                  className={`py-2 px-3 rounded-lg transition-all text-center ${
                    fontSize === size.id
                      ? isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-600 text-white'
                      : isDark
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  title={size.size}
                >
                  <span className="text-xs font-medium">{size.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Type size={18} className={isDark ? 'text-orange-400' : 'text-orange-600'} />
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Font Family
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {fontFamilies.map((font) => (
                <button
                  key={font.id}
                  onClick={() => onFontFamilyChange(font.id)}
                  className={`py-2 px-3 rounded-lg transition-all text-center ${
                    fontFamily === font.id
                      ? isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-600 text-white'
                      : isDark
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className={`text-sm font-medium ${font.class}`}>{font.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
