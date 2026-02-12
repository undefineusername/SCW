import { Users, MessageSquare, Settings as SettingsIcon, Bell } from 'lucide-react';

export type TabType = 'friends' | 'chats' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isDark: boolean;
  themeAccent: string;
  isConnected: boolean;
}

export default function Navigation({ activeTab, onTabChange, isDark, themeAccent, isConnected }: NavigationProps) {
  const tabs = [
    { id: 'friends' as const, icon: Users, label: 'Friends' },
    { id: 'chats' as const, icon: MessageSquare, label: 'Chats' },
    { id: 'settings' as const, icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <div className={`w-16 flex flex-col items-center py-6 gap-8 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-gray-100 border-gray-200'} border-r`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`p-2 rounded-xl transition-all ${isActive
              ? `${isDark ? 'text-white' : 'text-gray-900'} bg-${themeAccent} shadow-sm`
              : `${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`
              }`}
            title={tab.label}
          >
            <Icon size={24} />
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500'} animate-pulse`} />
          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter">
            {isConnected ? 'LIVE' : 'OFF'}
          </span>
        </div>

        <button className={`p-2 rounded-xl ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
          <Bell size={24} />
        </button>
      </div>
    </div>
  );
}
