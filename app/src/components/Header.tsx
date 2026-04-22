import { Cpu, FlaskConical, Wifi, WifiOff } from 'lucide-react';
import { useGPUStore } from '@/store/gpuStore';

export function Header() {
  const { dataSource, gpus, isConnected } = useGPUStore();
  const gpuLabel = dataSource === 'mock'
    ? `${gpus.length} simulated GPU${gpus.length !== 1 ? 's' : ''}`
    : `${gpus.length} GPU${gpus.length !== 1 ? 's' : ''} detected`;

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">live console</p>
        <h1>GPU Monitor</h1>
      </div>

      <div className="header-meta">
        <div>
          <Cpu size={14} />
          <span>{gpuLabel}</span>
        </div>

        <div>
          {dataSource === 'live' ? (
            <>
              <Wifi size={14} />
              <span>live</span>
            </>
          ) : dataSource === 'mock' && isConnected ? (
            <>
              <FlaskConical size={14} />
              <span>mock</span>
            </>
          ) : (
            <>
              <WifiOff size={14} />
              <span>offline</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
