import { X, Palette, Moon, Sun, Type, User, Camera, Trash2 } from 'lucide-react'
import { optimizeImage } from '@/lib/utils'

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
  avatar?: string
  onUpdateAvatar: (avatar: string) => void
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
  avatar,
  onUpdateAvatar,
}: SettingsModalProps) {
  if (!isOpen) return null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Image is too large. Please select a file smaller than 5MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const optimized = await optimizeImage(base64);
        onUpdateAvatar(optimized);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative w-full max-w-md mx-4 rounded-[24px] shadow-2xl overflow-hidden ${isDark ? 'bg-[#1a1c1e]' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-5 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
              <User size={20} />
            </div>
            <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Account Settings</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all ${isDark ? 'hover:bg-gray-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Profile Section - Premium Design */}
          <div className={`p-5 rounded-3xl ${isDark ? 'bg-gray-800/40 border border-gray-700' : 'bg-gray-50 border border-gray-100'}`}>
            <div className="flex items-center gap-2 mb-5">
              <h3 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                My Profile
              </h3>
            </div>
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl shadow-inner overflow-hidden border-2 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-100'}`}>
                  {avatar ? (
                    <img src={avatar} alt="Profile" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  ) : (
                    <span className="opacity-40">👤</span>
                  )}
                </div>
                <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg cursor-pointer hover:bg-purple-700 transition-all hover:scale-110 active:scale-95">
                  <Camera size={16} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
              <div className="flex-1 space-y-2">
                <button
                  onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20 active:scale-[0.98]"
                >
                  Change Photo
                </button>
                {avatar && (
                  <button
                    onClick={() => onUpdateAvatar('')}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-400/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </div>
            <p className={`mt-4 text-[10px] leading-relaxed text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Photo is synced P2P and never stored on servers.
            </p>
          </div>

          {/* Color Theme */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Palette size={16} className="text-purple-500" />
              <h3 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Theme Color
              </h3>
            </div>
            <div className="flex justify-between gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => onThemeChange(theme.id)}
                  className={`flex-1 aspect-square rounded-2xl transition-all relative ${theme.color} ${currentTheme === theme.id
                    ? `ring-4 ${isDark ? 'ring-purple-500/30' : 'ring-purple-500/20'} scale-110 shadow-lg`
                    : 'hover:scale-105 opacity-80'
                    }`}
                >
                  {currentTheme === theme.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white shadow-sm" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Dark Mode */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                {isDark ? <Moon size={16} className="text-blue-400" /> : <Sun size={16} className="text-yellow-500" />}
                <h3 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Mode
                </h3>
              </div>
              <button
                onClick={onToggleDark}
                className={`w-full py-3 rounded-2xl text-xs font-bold transition-all border ${isDark
                  ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700'
                  : 'bg-white border-gray-100 text-gray-900 hover:bg-gray-50'
                  } shadow-sm`}
              >
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </button>
            </div>

            {/* Font Family */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <Type size={16} className="text-orange-500" />
                <h3 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Font
                </h3>
              </div>
              <div className={`p-1 rounded-2xl border flex gap-1 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                {fontFamilies.map((font) => (
                  <button
                    key={font.id}
                    onClick={() => onFontFamilyChange(font.id)}
                    className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all ${fontFamily === font.id
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                      } ${isDark && fontFamily === font.id ? '!bg-gray-700 !text-white' : ''}`}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Text Size */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Type size={16} className="text-green-500" />
              <h3 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Scale
              </h3>
            </div>
            <div className={`p-1 rounded-2xl border flex gap-1 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
              {fontSizes.map((size) => (
                <button
                  key={size.id}
                  onClick={() => onFontSizeChange(size.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${fontSize === size.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                    } ${isDark && fontSize === size.id ? '!bg-gray-700 !text-white' : ''}`}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
