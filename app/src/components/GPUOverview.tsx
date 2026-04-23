import { useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { useGPUStore } from '@/store/gpuStore';
import type { GPUData } from '@/types';

interface Props {
  gpus: GPUData[];
}

function formatMemory(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${mib} MB`;
}

function usageClass(value: number): string {
  if (value >= 90) return 'usage-hot';
  if (value >= 70) return 'usage-warm';
  return 'usage-calm';
}

function ExpandedPanel({ gpu }: { gpu: GPUData }) {
  const history = useGPUStore((s) => s.history);
  const data = useMemo(() => history.get(gpu.id) || [], [gpu.id, history]);
  const memoryPercent = gpu.memoryTotal
    ? Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100)
    : 0;
  const powerPercent = gpu.powerLimit
    ? Math.round((gpu.powerDraw / gpu.powerLimit) * 100)
    : 0;

  return (
    <div className="gpu-card-expanded">
      <div className="metric-card-grid">
        <article className="metric-card">
          <span>Utilization</span>
          <strong className={usageClass(gpu.utilization)}>{gpu.utilization}%</strong>
          <div className="meter"><i style={{ width: `${gpu.utilization}%` }} /></div>
        </article>
        <article className="metric-card">
          <span>VRAM</span>
          <strong>{formatMemory(gpu.memoryUsed)}</strong>
          <p>{formatMemory(gpu.memoryTotal)} total</p>
          <div className="meter"><i style={{ width: `${memoryPercent}%` }} /></div>
        </article>
        <article className="metric-card">
          <span>Temperature</span>
          <strong className={gpu.temperature >= 80 ? 'usage-hot' : ''}>
            {gpu.temperature}°C
          </strong>
        </article>
        <article className="metric-card">
          <span>Power</span>
          <strong>{gpu.powerDraw}W</strong>
          <p>{gpu.powerLimit}W limit</p>
          <div className="meter"><i style={{ width: `${powerPercent}%` }} /></div>
        </article>
        <article className="metric-card">
          <span>Fan</span>
          <strong>{gpu.fanSpeed}%</strong>
        </article>
      </div>

      <div className="expanded-chart-box">
        {data.length < 2 ? (
          <div className="empty-state">collecting data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(8,8,10,0.92)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  color: '#e8e8e9',
                  fontFamily: 'var(--mono-font)',
                  fontSize: '11px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}
                labelStyle={{ color: '#6b6b74' }}
                formatter={(value: number, name: string) => {
                  const label = name === 'utilization' ? 'util' : name === 'memoryUsed' ? 'vram' : name;
                  return [`${value}%`, label];
                }}
              />
              <Line
                type="monotone"
                dataKey="utilization"
                stroke="#e8e8e9"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="memoryUsed"
                stroke="#6b6b74"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {gpu.processes.length > 0 && (
        <div className="expanded-processes">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            {gpu.processes.length} process{gpu.processes.length !== 1 ? 'es' : ''}
          </div>
          <div className="expanded-process-list">
            {gpu.processes.map((proc) => (
              <div className="expanded-process-item" key={`${proc.gpuId}:${proc.pid}`}>
                <div>
                  <strong>{proc.user}</strong>
                  <span className="faint">PID {proc.pid}</span>
                </div>
                <div className="mono">{formatMemory(proc.memoryUsage)}</div>
                <code>{proc.cmdLine || proc.name}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function GPUOverview({ gpus }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <section className="surface">
      <div className="surface-head">
        <h2>Devices</h2>
        <span className="mono">{gpus.length} detected</span>
      </div>

      <div className="gpu-card-list">
        {gpus.map((gpu) => {
          const isExpanded = expandedId === gpu.id;
          return (
            <div key={gpu.id}>
              <button
                type="button"
                className={`gpu-card ${isExpanded ? 'active' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : gpu.id)}
              >
                <div className="gpu-card-name">
                  <div className="eyebrow">GPU {gpu.id}</div>
                  <div className="truncate-cell" title={gpu.name}>
                    {gpu.name}
                  </div>
                </div>
                <div>
                  <div className="gpu-card-label">util</div>
                  <div className={`gpu-card-value ${usageClass(gpu.utilization)}`}>
                    {gpu.utilization}%
                  </div>
                </div>
                <div>
                  <div className="gpu-card-label">vram</div>
                  <div className="gpu-card-value">
                    {formatMemory(gpu.memoryUsed)}{' '}
                    <span className="faint">/ {formatMemory(gpu.memoryTotal)}</span>
                  </div>
                </div>
                <div>
                  <div className="gpu-card-label">temp</div>
                  <div
                    className={`gpu-card-value ${
                      gpu.temperature >= 80 ? 'usage-hot' : ''
                    }`}
                  >
                    {gpu.temperature}°
                  </div>
                </div>
                <div>
                  <div className="gpu-card-label">procs</div>
                  <div className="gpu-card-value faint">{gpu.processes.length}</div>
                </div>
              </button>
              <div className={`gpu-card-expanded-wrap ${isExpanded ? 'open' : ''}`}>
                <div className="gpu-card-expanded-inner">
                  <ExpandedPanel gpu={gpu} />
                </div>
              </div>
            </div>
          );
        })}

        {gpus.length === 0 && (
          <div className="empty-state" style={{ minHeight: 120 }}>
            No GPU data.
          </div>
        )}
      </div>
    </section>
  );
}
