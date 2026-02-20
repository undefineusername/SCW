'use client'

import { Palette, Moon, Sun } from 'lucide-react'

interface ThemePickerProps {
  currentTheme: 'purple' | 'blue' | 'green' | 'orange' | 'pink'
  onThemeChange: (theme: 'purple' | 'blue' | 'green' | 'orange' | 'pink') => void
  isDark: boolean
  onToggleDark: () => void
}

const themes = [
  { id: 'purple', label: 'Purple', color: 'bg-purple-500' },
  { id: 'blue', label: 'Blue', color: 'bg-blue-500' },
  { id: 'green', label: 'Green', color: 'bg-green-500' },
  { id: 'orange', label: 'Orange', color: 'bg-orange-500' },
  { id: 'pink', label: 'Pink', color: 'bg-pink-500' },
] as const

export default function ThemePicker({ currentTheme, onThemeChange, isDark, onToggleDark }: ThemePickerProps) {
  return (
    <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
      {/* Color Theme */}
      <div className={`flex items-center gap-2 mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
        <Palette size={14} />
        <span className="text-xs font-semibold uppercase tracking-wide">Color</span>
      </div>
      <div className="flex gap-2">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            className={`w-7 h-7 rounded-md transition-all ${theme.color} ${
              currentTheme === theme.id ? `ring-2 ring-offset-2 ${isDark ? 'ring-offset-gray-800 ring-gray-400' : 'ring-offset-white ring-gray-300'}` : 'hover:opacity-80'
            }`}
            title={theme.label}
          />
        ))}
      </div>

      {/* Dark Mode */}
      <div className={`flex items-center gap-2 justify-between pt-3 mt-3 ${isDark ? 'border-gray-700' : 'border-gray-200'} border-t`}>
        <div className="flex items-center gap-2">
          {isDark ? <Moon size={14} className="text-gray-400" /> : <Sun size={14} className="text-gray-600" />}
          <span className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {isDark ? 'Dark' : 'Light'}
          </span>
        </div>
        <button
          onClick={onToggleDark}
          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
            isDark 
              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Toggle
        </button>
      </div>
    </div>
  )
}
