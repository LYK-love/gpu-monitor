import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { useGPUStore } from '@/store/gpuStore';
import type { ResourceHistoryPoint } from '@/types';

const GPU_COLORS = ['#7dd3fc', '#86efac', '#fcd34d', '#f0abfc', '#c4b5fd', '#67e8f9'];

type Metric = {
  id: string;
  label: string;
  metricLabel: string;
  description: string;
  value: number;
  color: string;
  dataKey: keyof ResourceHistoryPoint | `gpu${number}`;
  group: 'system' | 'gpu';
  focusGpuId?: number;
};

interface Props {
  compact?: boolean;
  onSelectGPU?: (gpuId: number) => void;
}

export function ResourceChart({ compact = false, onSelectGPU }: Props) {
  const history = useGPUStore((s) => s.resourceHistory);
  const gpus = useGPUStore((s) => s.gpus);
  const system = useGPUStore((s) => s.system);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const metrics: Metric[] = useMemo(() => {
    const systemMetrics: Metric[] = [
      {
        id: 'cpu',
        label: 'CPU',
        metricLabel: 'host utilization',
        description: 'Host CPU utilization',
        value: Math.round(system?.cpuUtilization ?? 0),
        color: '#e5e7eb',
        dataKey: 'systemCpu',
        group: 'system',
      },
      {
        id: 'memory',
        label: 'Memory',
        metricLabel: 'host memory used',
        description: 'Host memory used',
        value: system?.memoryTotal ? Math.round((system.memoryUsed / system.memoryTotal) * 100) : 0,
        color: '#94a3b8',
        dataKey: 'systemMemory',
        group: 'system',
      },
    ];

    const gpuMetrics = gpus.map((gpu, index): Metric => ({
      id: `gpu-${gpu.id}`,
      label: `GPU ${gpu.id}`,
      metricLabel: 'utilization',
      description: `GPU ${gpu.id} utilization`,
      value: gpu.utilization,
      color: GPU_COLORS[index % GPU_COLORS.length],
      dataKey: `gpu${gpu.id}`,
      group: 'gpu',
      focusGpuId: gpu.id,
    }));

    return [...systemMetrics, ...gpuMetrics];
  }, [gpus, system]);

  const shownMetrics = metrics.filter((metric) => !hidden.has(metric.id));
  const renderedMetrics = compact ? shownMetrics.slice(0, 4) : shownMetrics;

  const toggle = (id: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: Metric['group']) => {
    setHidden((current) => {
      const next = new Set(current);
      const ids = metrics.filter((metric) => metric.group === group).map((metric) => metric.id);
      const allVisible = ids.every((id) => !next.has(id));
      ids.forEach((id) => {
        if (allVisible) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const groupVisible = (group: Metric['group']) => (
    metrics.some((metric) => metric.group === group) &&
    metrics.filter((metric) => metric.group === group).every((metric) => !hidden.has(metric.id))
  );

  return (
    <section className="resource-section">
      <div className="resource-topline">
        <div>
          <p className="eyebrow">telemetry</p>
          <h2>Resource tiles</h2>
        </div>
        <div className="metric-filter">
          <button
            type="button"
            className={groupVisible('system') ? 'active' : ''}
            onClick={() => toggleGroup('system')}
          >
            system
          </button>
          <button
            type="button"
            className={groupVisible('gpu') ? 'active' : ''}
            onClick={() => toggleGroup('gpu')}
          >
            all gpu
          </button>
          {metrics.map((metric) => (
            <button
              type="button"
              key={metric.id}
              className={!hidden.has(metric.id) ? 'active' : ''}
              onClick={() => toggle(metric.id)}
            >
              {metric.label.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="resource-tile-grid">
        {renderedMetrics.map((metric) => (
          <article className="resource-tile" key={metric.id}>
            <div className="resource-tile-head">
              <div>
                <span>{metric.label}</span>
                <em>{metric.metricLabel}</em>
              </div>
              <strong style={{ color: metric.color }}>{metric.value}%</strong>
            </div>
            {metric.focusGpuId !== undefined && (
              <button
                type="button"
                className="tile-drilldown"
                onClick={() => onSelectGPU?.(metric.focusGpuId!)}
              >
                open GPU telemetry
              </button>
            )}
            <div className="tile-chart">
              {history.length < 2 ? (
                <div className="empty-state">collecting</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`grad-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={metric.color} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={metric.color} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        border: '1px solid rgba(148,163,184,0.18)',
                        borderRadius: '8px',
                        color: '#e5e7eb',
                        fontFamily: 'var(--mono-font)',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(value) => [`${value}%`, metric.description]}
                    />
                    <Area
                      type="monotone"
                      dataKey={metric.dataKey}
                      stroke={metric.color}
                      strokeWidth={2}
                      fill={`url(#grad-${metric.id})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
