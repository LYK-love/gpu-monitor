import { ArrowLeft } from 'lucide-react';
import { GPUTelemetry } from './GPUTelemetry';
import type { GPUData } from '@/types';

interface Props {
  gpu: GPUData;
  onBack: () => void;
}

function formatMemory(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${mib} MB`;
}

export function GPUDetail({ gpu, onBack }: Props) {
  const memoryPercent = gpu.memoryTotal ? Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100) : 0;
  const powerPercent = gpu.powerLimit ? Math.round((gpu.powerDraw / gpu.powerLimit) * 100) : 0;

  return (
    <section className="detail-page">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        overview
      </button>

      <div className="detail-hero">
        <div>
          <p className="eyebrow">gpu {gpu.id}</p>
          <h2>{gpu.name}</h2>
          <span>{gpu.processes.length} active processes</span>
        </div>
        <strong>{gpu.utilization}%</strong>
      </div>

      <div className="metric-card-grid">
        <article className="metric-card">
          <span>utilization</span>
          <strong>{gpu.utilization}%</strong>
          <div className="meter"><i style={{ width: `${gpu.utilization}%` }} /></div>
        </article>
        <article className="metric-card">
          <span>vram</span>
          <strong>{formatMemory(gpu.memoryUsed)}</strong>
          <p>{formatMemory(gpu.memoryTotal)} total</p>
          <div className="meter"><i style={{ width: `${memoryPercent}%` }} /></div>
        </article>
        <article className="metric-card">
          <span>temperature</span>
          <strong>{gpu.temperature}C</strong>
          <p>fan {gpu.fanSpeed}%</p>
        </article>
        <article className="metric-card">
          <span>power</span>
          <strong>{gpu.powerDraw}W</strong>
          <p>{gpu.powerLimit}W limit</p>
          <div className="meter"><i style={{ width: `${Math.min(powerPercent, 100)}%` }} /></div>
        </article>
      </div>

      <GPUTelemetry gpu={gpu} />

      <div className="detail-processes">
        <div className="surface-head">
          <div>
            <p className="eyebrow">attached</p>
            <h2>processes on GPU {gpu.id}</h2>
          </div>
        </div>
        {gpu.processes.length === 0 ? (
          <div className="empty-state detail-empty">No active GPU process.</div>
        ) : (
          gpu.processes.map((proc) => (
            <div className="detail-process-row" key={`${proc.gpuId}:${proc.pid}`}>
              <div>
                <strong>{proc.user}</strong>
                <span>PID {proc.pid} / UID {proc.uid} / {formatMemory(proc.memoryUsage)}</span>
              </div>
              <code>{proc.cmdLine || proc.name}</code>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
