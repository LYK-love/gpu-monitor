import { useGPUStore } from '@/store/gpuStore';

export function StatusBar() {
  const { dataSource, lastUpdate, gpus, statusMessage } = useGPUStore();

  const totalPower = gpus.reduce((sum, g) => sum + g.powerDraw, 0);
  const totalMem = gpus.reduce((sum, g) => sum + g.memoryUsed, 0);
  const totalMemCap = gpus.reduce((sum, g) => sum + g.memoryTotal, 0);
  const avgTemp = gpus.length > 0
    ? Math.round(gpus.reduce((sum, g) => sum + g.temperature, 0) / gpus.length)
    : 0;

  const timeStr = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--';

  return (
    <div className="status-bar">
      <span
        className={`status-indicator ${dataSource === 'offline' ? 'status-offline' : 'status-online'}`}
      />
      <span>{statusMessage}</span>
      <span className="text-[var(--border-color)]">|</span>
      <span>Updated: {timeStr}</span>
      <span className="text-[var(--border-color)]">|</span>
      <span className="text-[var(--accent-primary)]">Avg Temp: {avgTemp}°C</span>
      <span className="text-[var(--border-color)]">|</span>
      <span className="text-amber-600">Power: {totalPower}W</span>
      <span className="text-[var(--border-color)]">|</span>
      <span className="text-neutral-300">
        VRAM: {(totalMem / 1024).toFixed(1)} / {(totalMemCap / 1024).toFixed(0)} GB
      </span>
      <div className="flex-1" />
      <span className="text-[var(--text-secondary)] opacity-60">
        Press Ctrl+C to exit TUI / Close tab for Web
      </span>
    </div>
  );
}
