import { MoonStar, SunMedium } from 'lucide-react';
import { useGPUStore } from '@/store/gpuStore';

type HeaderProps = {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
};

export function Header({ theme, onToggleTheme }: HeaderProps) {
  const { dataSource, isConnected, statusMessage } = useGPUStore();

  let statusClass = 'offline';
  if (dataSource === 'live') statusClass = 'online';
  else if (dataSource === 'mock' && isConnected) statusClass = 'mock';

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-kicker">Telemetry Console</div>
        <h1>GPU Monitor</h1>
      </div>
      <div className="header-meta">
        <div className="header-meta-item">
          <span className={`status-dot ${statusClass}`} />
          <span>{dataSource === 'live' ? 'live' : dataSource === 'mock' ? 'mock' : 'offline'}</span>
        </div>
        <div className="header-meta-item header-meta-message">
          <span>{statusMessage}</span>
        </div>
        <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle color theme">
          {theme === 'dark' ? <SunMedium size={15} /> : <MoonStar size={15} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
  );
}
