import { useGPUStore } from '@/store/gpuStore';

export function StatusBar() {
  const { dataSource, lastUpdate, gpus, statusMessage, system } = useGPUStore();

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
      <span className="status-group">
        <span
          className={`status-indicator ${dataSource === 'offline' ? 'status-offline' : 'status-online'}`}
        />
        <span>{statusMessage}</span>
      </span>
      <span className="status-metric">
        <span>updated</span>
        <strong>{timeStr}</strong>
      </span>
      <span className="status-metric">
        <span>avg temp</span>
        <strong>{avgTemp}C</strong>
      </span>
      <span className="status-metric">
        <span>sum power</span>
        <strong>{totalPower.toFixed(1)}W</strong>
      </span>
      <span className="status-metric">
        <span>sum vram</span>
        <strong>{(totalMem / 1024).toFixed(1)} GB</strong>
      </span>
      <span className="status-metric">
        <span>sum capacity</span>
        <strong>{(totalMemCap / 1024).toFixed(0)} GB</strong>
      </span>
      <span className="status-metric">
        <span>system cpu</span>
        <strong>{Math.round(system?.cpuUtilization ?? 0)}%</strong>
      </span>
      <span className="status-metric">
        <span>system mem</span>
        <strong>
          {system?.memoryTotal
            ? `${Math.round((system.memoryUsed / system.memoryTotal) * 100)}%`
            : '0%'}
        </strong>
      </span>
      <div className="flex-1" />
    </div>
  );
}
