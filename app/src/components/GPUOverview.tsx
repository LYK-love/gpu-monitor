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

  return (
    <div className="gpu-expanded">
      <div className="gpu-expanded-grid">
        <div>
          <span>Power</span>
          <strong>{gpu.powerDraw}W</strong>
        </div>
        <div>
          <span>Power limit</span>
          <strong>{gpu.powerLimit}W</strong>
        </div>
        <div>
          <span>Fan</span>
          <strong>{gpu.fanSpeed}%</strong>
        </div>
        <div>
          <span>VRAM %</span>
          <strong>{memoryPercent}%</strong>
        </div>
        <div>
          <span>Power %</span>
          <strong>{powerPercent}%</strong>
        </div>
      </div>

      <div className="sparkline-box">
        {data.length < 2 ? (
          <div className="empty-state">collecting</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(10,10,12,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#ececf1',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                }}
                labelStyle={{ color: '#6b7280' }}
                formatter={(value: number, name: string) => {
                  const label = name === 'utilization' ? 'util' : name === 'memoryUsed' ? 'vram' : name;
                  return [`${value}%`, label];
                }}
              />
              <Line
                type="monotone"
                dataKey="utilization"
                stroke="#ececf1"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="memoryUsed"
                stroke="#6b7280"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {gpu.processes.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            {gpu.processes.length} process{gpu.processes.length !== 1 ? 'es' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {gpu.processes.map((proc) => (
              <div
                key={`${proc.gpuId}:${proc.pid}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 70px 100px 1fr',
                  gap: 12,
                  padding: '10px 14px',
                  background: 'var(--bg-base)',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>{proc.user}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{proc.pid}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>{formatMemory(proc.memoryUsage)}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={proc.cmdLine || proc.name}>{proc.cmdLine || proc.name}</span>
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
                    <div
                      className="gpu-bar-fill"
                      style={{
                        width: `${gpu.utilization}%`,
                        background: barColor(gpu.utilization),
                      }}
                    />
                  </div>
                  <span className="gpu-bar-value">{gpu.utilization}%</span>
                </div>

                <div className="gpu-bar-row">
                  <span className="gpu-bar-label">VRAM</span>
                  <div className="gpu-bar-track">
                    <div
                      className="gpu-bar-fill"
                      style={{
                        width: `${memoryPercent}%`,
                        background: barColor(memoryPercent),
                      }}
                    />
                  </div>
                  <span className="gpu-bar-value">
                    {formatMemory(gpu.memoryUsed)} / {formatMemory(gpu.memoryTotal)}
                  </span>
                </div>

                <div className="gpu-bar-row">
                  <span className="gpu-bar-label">Temp</span>
                  <div className="gpu-bar-track">
                    <div
                      className="gpu-bar-fill"
                      style={{
                        width: `${Math.min(gpu.temperature, 100)}%`,
                        background: gpu.temperature >= 80 ? 'var(--red)' : gpu.temperature >= 65 ? 'var(--yellow)' : 'var(--green)',
                      }}
                    />
                  </div>
                  <span className="gpu-bar-value">{gpu.temperature}°C</span>
                </div>
              </div>
            </button>

            <div className={`gpu-expanded-wrap ${isExpanded ? 'open' : ''}`}>
              <div className="gpu-expanded-inner">
                <ExpandedPanel gpuId={gpu.id} />
              </div>
            </div>
          </div>
        );
      })}

      {gpus.length === 0 && (
        <div className="empty-state">No GPU data.</div>
      )}
    </div>
  );
}
