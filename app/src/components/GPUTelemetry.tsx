import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { useGPUStore } from '@/store/gpuStore';
import type { GPUData, HistoryPoint } from '@/types';

interface Props {
  gpu: GPUData;
}

type MetricKey = 'utilization' | 'memoryUsed' | 'powerPercent' | 'temperature' | 'fanSpeed';

const METRICS: Array<{
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  importance: 'primary' | 'secondary';
}> = [
  { key: 'utilization', label: 'utilization', unit: '%', color: '#7dd3fc', importance: 'primary' },
  { key: 'memoryUsed', label: 'vram used', unit: '%', color: '#86efac', importance: 'primary' },
  { key: 'powerPercent', label: 'power limit', unit: '%', color: '#fcd34d', importance: 'secondary' },
  { key: 'temperature', label: 'temperature', unit: 'C', color: '#fb7185', importance: 'secondary' },
  { key: 'fanSpeed', label: 'fan speed', unit: '%', color: '#c4b5fd', importance: 'secondary' },
];

export function GPUTelemetry({ gpu }: Props) {
  const history = useGPUStore((s) => s.history);
  const data = useMemo(() => history.get(gpu.id) || [], [gpu.id, history]);
  const [visible, setVisible] = useState<Set<MetricKey>>(new Set(['utilization', 'memoryUsed']));

  const latest = useMemo(() => data[data.length - 1] || null, [data]);

  const toggle = (key: MetricKey) => {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="gpu-telemetry-panel">
      <div className="surface-head telemetry-head">
        <div>
          <p className="eyebrow">gpu telemetry</p>
          <h2>GPU {gpu.id} multi-metric history</h2>
          <span>utilization and VRAM are primary; power, temperature, and fan are optional overlays</span>
        </div>
        <div className="metric-filter">
          {METRICS.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={visible.has(metric.key) ? 'active' : ''}
              onClick={() => toggle(metric.key)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="gpu-telemetry-layout">
        <div className="gpu-telemetry-chart">
          {data.length < 2 ? (
            <div className="empty-state">Collecting GPU telemetry...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 12, right: 16, left: -18, bottom: 8 }}>
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
                  formatter={(value, name) => {
                    const metric = METRICS.find((item) => item.key === name);
                    return [`${value}${metric?.unit ?? ''}`, metric?.label ?? name];
                  }}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as HistoryPoint | undefined;
                    return point?.timeStr ?? '';
                  }}
                />
                {METRICS.filter((metric) => visible.has(metric.key)).map((metric) => (
                  metric.importance === 'primary' ? (
                    <Area
                      key={metric.key}
                      type="monotone"
                      dataKey={metric.key}
                      stroke={metric.color}
                      strokeWidth={2}
                      fill={metric.color}
                      fillOpacity={0.12}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ) : (
                    <Line
                      key={metric.key}
                      type="monotone"
                      dataKey={metric.key}
                      stroke={metric.color}
                      strokeWidth={1.7}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="gpu-telemetry-facts">
          {METRICS.map((metric) => (
            <article key={metric.key}>
              <span>{metric.label}</span>
              <strong style={{ color: metric.color }}>
                {latest ? latest[metric.key] : 0}{metric.unit}
              </strong>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
