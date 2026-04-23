import { useGPUStore } from '@/store/gpuStore';

export function Header() {
  const { dataSource, gpus, isConnected } = useGPUStore();

  let statusClass = 'offline';
  let statusLabel = 'offline';
  if (dataSource === 'live') {
    statusClass = 'online';
    statusLabel = 'live';
  } else if (dataSource === 'mock' && isConnected) {
    statusClass = 'mock';
    statusLabel = 'mock';
  }

  return (
    <header className="app-header">
      <h1>GPU Monitor</h1>
      <div className="header-meta">
        <div className="header-meta-item">
          <span className={`status-dot ${statusClass}`} />
          <span>{statusLabel}</span>
        </div>
        <div className="header-meta-item mono">
          {gpus.length} GPU{gpus.length !== 1 ? 's' : ''}
        </div>
      </div>
    </header>
  );
}
