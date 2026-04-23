import { useGPUStore } from '@/store/gpuStore';

export function Header() {
  const { dataSource, isConnected } = useGPUStore();

  let statusClass = 'offline';
  if (dataSource === 'live') statusClass = 'online';
  else if (dataSource === 'mock' && isConnected) statusClass = 'mock';

  return (
    <header className="app-header">
      <h1>GPU Monitor</h1>
      <div className="header-meta">
        <div className="header-meta-item">
          <span className={`status-dot ${statusClass}`} />
          <span>{dataSource === 'live' ? 'live' : dataSource === 'mock' ? 'mock' : 'offline'}</span>
        </div>
      </div>
    </header>
  );
}
