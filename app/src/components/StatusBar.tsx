import { useGPUStore } from '@/store/gpuStore';

export function StatusBar() {
  const { lastUpdate, system } = useGPUStore();

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
      <span className="status-metric">
        <span>updated</span>
        <strong>{timeStr}</strong>
      </span>
      <span className="status-metric">
        <span>cpu</span>
        <strong>{Math.round(system?.cpuUtilization ?? 0)}%</strong>
      </span>
      <span className="status-metric">
        <span>mem</span>
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
