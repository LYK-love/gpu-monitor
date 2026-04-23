import { useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { useGPUStore } from '@/store/gpuStore';

function formatMemory(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${mib} MB`;
}

function barColor(value: number): string {
  if (value >= 85) return 'var(--red)';
  if (value >= 60) return 'var(--yellow)';
  return 'var(--green)';
}

function formatCompactMemory(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${Math.round(mib)} MB`;
}

function formatPower(watts: number): string {
  return `${Math.round(watts)}W`;
}

function ExpandedPanel({ gpuId }: { gpuId: number }) {
  const gpus = useGPUStore((s) => s.gpus);
  const history = useGPUStore((s) => s.history);
  const gpu = gpus.find((g) => g.id === gpuId);
  const data = useMemo(() => history.get(gpuId) || [], [gpuId, history]);

  if (!gpu) return null;

  const memoryPercent = gpu.memoryTotal
    ? Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100)
    : 0;
  const powerPercent = gpu.powerLimit
    ? Math.round((gpu.powerDraw / gpu.powerLimit) * 100)
    : 0;

  const tooltipStyle = {
    backgroundColor: 'var(--tooltip-bg)',
    border: '1px solid var(--tooltip-border)',
    borderRadius: '6px',
    color: 'var(--tooltip-text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    boxShadow: 'var(--shadow-card)',
  };

  return (
    <div className="gpu-detail-panel">
      <div className="gpu-detail-grid">
        <article className="gpu-detail-card accent">
          <span className="gpu-detail-label">Power Envelope</span>
          <strong className="gpu-detail-value">
            {formatPower(gpu.powerDraw)}
            <span>/ {formatPower(gpu.powerLimit)}</span>
          </strong>
          <div className="gpu-detail-meta">
            <span>{powerPercent}% of limit</span>
          </div>
        </article>
        <article className="gpu-detail-card">
          <span className="gpu-detail-label">VRAM Footprint</span>
          <strong className="gpu-detail-value">
            {formatCompactMemory(gpu.memoryUsed)}
            <span>/ {formatCompactMemory(gpu.memoryTotal)}</span>
          </strong>
          <div className="gpu-detail-meta">
            <span>{memoryPercent}% occupied</span>
          </div>
        </article>
        <article className="gpu-detail-card">
          <span className="gpu-detail-label">Thermals</span>
          <strong className="gpu-detail-value">
            {gpu.temperature}°C
            <span>{gpu.fanSpeed}% fan</span>
          </strong>
          <div className="gpu-detail-meta">
            <span>{gpu.processes.length} VRAM process{gpu.processes.length !== 1 ? 'es' : ''}</span>
          </div>
        </article>
      </div>

      <div className="gpu-chart-shell">
        {data.length < 2 ? (
          <div className="empty-state">collecting</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <YAxis domain={[0, 100]} hide />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-muted)' }} formatter={(value: number, name: string) => { const label = name === 'utilization' ? 'util' : name === 'memoryUsed' ? 'vram' : name; return [`${value}%`, label]; }} />
              <Line type="monotone" dataKey="utilization" stroke="var(--chart-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="memoryUsed" stroke="var(--chart-secondary)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {gpu.processes.length > 0 && (
        <div className="detail-process-block">
          <div className="detail-process-header">
            <div className="detail-process-title">
              {gpu.processes.length} VRAM process{gpu.processes.length !== 1 ? 'es' : ''}
            </div>
            <div className="detail-process-caption">User / PID / VRAM / Command</div>
          </div>
          <div className="detail-process-table">
            <div className="detail-process-columns">
              <span>User</span>
              <span>PID</span>
              <span className="align-right">VRAM</span>
              <span>Command</span>
            </div>
            {gpu.processes.map((proc) => (
              <div key={`${proc.gpuId}:${proc.pid}`} className="detail-process-row">
                <span className="detail-process-user">{proc.user}</span>
                <span className="detail-process-pid">{proc.pid}</span>
                <span className="detail-process-vram">{formatMemory(proc.memoryUsage)}</span>
                <span className="detail-process-command" title={proc.cmdLine || proc.name}>
                  {proc.cmdLine || proc.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function GPUOverview() {
  const gpus = useGPUStore((s) => s.gpus);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="gpu-card-list">
      {gpus.map((gpu) => {
        const isExpanded = expandedId === gpu.id;
        const memoryPercent = gpu.memoryTotal
          ? Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100)
          : 0;

        return (
          <div key={gpu.id}>
            <button
              type="button"
              className={`gpu-card ${isExpanded ? 'active' : ''}`}
              onClick={() => setExpandedId(isExpanded ? null : gpu.id)}
            >
              <div className="gpu-card-header">
                <div>
                  <h3>GPU {gpu.id}</h3>
                  <div className="gpu-name">{gpu.name}</div>
                </div>
                <div className="gpu-card-meta">
                  <span>{gpu.processes.length} procs</span>
                </div>
              </div>

              <div className="gpu-bars">
                <div className="gpu-bar-row">
                  <span className="gpu-bar-label">Util</span>
                  <div className="gpu-bar-track">
                    <div className="gpu-bar-fill" style={{ width: `${gpu.utilization}%`, background: barColor(gpu.utilization) }} />
                  </div>
                  <span className="gpu-bar-value">{gpu.utilization}%</span>
                </div>

                <div className="gpu-bar-row">
                  <span className="gpu-bar-label">VRAM</span>
                  <div className="gpu-bar-track">
                    <div className="gpu-bar-fill" style={{ width: `${memoryPercent}%`, background: barColor(memoryPercent) }} />
                  </div>
                  <span className="gpu-bar-value">
                    {formatMemory(gpu.memoryUsed)} / {formatMemory(gpu.memoryTotal)}
                  </span>
                </div>

                <div className="gpu-bar-row">
                  <span className="gpu-bar-label">Temp</span>
                  <div className="gpu-bar-track">
                    <div className="gpu-bar-fill" style={{ width: `${Math.min(gpu.temperature, 100)}%`, background: gpu.temperature >= 80 ? 'var(--red)' : gpu.temperature >= 65 ? 'var(--yellow)' : 'var(--green)' }} />
                  </div>
                  <span className="gpu-bar-value">{gpu.temperature}°C</span>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="gpu-expanded-shell">
                <ExpandedPanel gpuId={gpu.id} />
              </div>
            )}
          </div>
        );
      })}

      {gpus.length === 0 && (
        <div className="empty-state">No GPU data.</div>
      )}
    </div>
  );
}
