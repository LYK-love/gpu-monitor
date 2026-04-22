import { Activity, Cpu, FlaskConical, Wifi, WifiOff } from 'lucide-react';
import { useGPUStore } from '@/store/gpuStore';

export function Header() {
  const { dataSource, gpus, isConnected } = useGPUStore();
  const gpuLabel = dataSource === 'mock'
    ? `${gpus.length} simulated GPU${gpus.length !== 1 ? 's' : ''}`
    : `${gpus.length} GPU${gpus.length !== 1 ? 's' : ''} detected`;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
      <div className="flex items-center gap-3">
        <Activity size={20} className="text-[var(--accent-primary)]" />
        <h1 className="text-lg font-bold text-white">
          GPU MONITOR
        </h1>
        <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-sm border border-[var(--border-color)]">
          v0.1
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* GPU count */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Cpu size={14} />
          <span>{gpuLabel}</span>
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2">
          {dataSource === 'live' ? (
            <>
              <Wifi size={14} className="text-green-600" />
              <span className="text-[10px] text-green-600 font-medium">LIVE</span>
            </>
          ) : dataSource === 'mock' && isConnected ? (
            <>
              <FlaskConical size={14} className="text-amber-600" />
              <span className="text-[10px] text-amber-600 font-medium">MOCK</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-[var(--accent-secondary)]" />
              <span className="text-[10px] text-[var(--accent-secondary)] font-medium">
                OFFLINE
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
