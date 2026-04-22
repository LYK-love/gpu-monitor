import type { GPUData } from '@/types';

interface Props {
  gpus: GPUData[];
  onSelectGPU?: (gpuId: number) => void;
}

function formatMemory(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${mib} MB`;
}

function usageClass(value: number): string {
  if (value >= 90) return 'usage-hot';
  if (value >= 70) return 'usage-warm';
  return 'usage-calm';
}

export function GPUOverview({ gpus, onSelectGPU }: Props) {
  return (
    <section className="surface">
      <div className="surface-head">
        <div>
          <p className="eyebrow">devices</p>
          <h2>GPU overview</h2>
        </div>
        <span>{gpus.length} detected</span>
      </div>

      <div className="grid-table gpu-grid-table">
        <div className="grid-row grid-head">
          <div>gpu</div>
          <div>name</div>
          <div className="align-right">util</div>
          <div className="align-right">vram</div>
          <div className="align-right">temp</div>
          <div className="align-right">power</div>
          <div className="align-right">processes</div>
        </div>

        {gpus.map((gpu) => (
          <button className="grid-row row-button" key={gpu.id} onClick={() => onSelectGPU?.(gpu.id)} type="button">
            <div className="mono muted">GPU {gpu.id}</div>
            <div className="truncate-cell" title={gpu.name}>{gpu.name}</div>
            <div className={`align-right mono ${usageClass(gpu.utilization)}`}>{gpu.utilization}%</div>
            <div className="align-right mono">
              {formatMemory(gpu.memoryUsed)} <span className="muted">/ {formatMemory(gpu.memoryTotal)}</span>
            </div>
            <div className={`align-right mono ${gpu.temperature >= 80 ? 'usage-hot' : ''}`}>
              {gpu.temperature}C
            </div>
            <div className="align-right mono">
              {gpu.powerDraw}W <span className="muted">/ {gpu.powerLimit}W</span>
            </div>
            <div className="align-right mono">{gpu.processes.length}</div>
          </button>
        ))}

        {gpus.length === 0 && <div className="empty-state">No GPU data.</div>}
      </div>
    </section>
  );
}
