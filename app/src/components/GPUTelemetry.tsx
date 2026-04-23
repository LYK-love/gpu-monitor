import { useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
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
}> = [
  { key: 'utilization', label: 'utilization', unit: '%', color: '#e8e8e9' },
  { key: 'memoryUsed', label: 'vram', unit: '%', color: '#a1a1aa' },
  { key: 'powerPercent', label: 'power', unit: '%', color: '#6b6b74' },
  { key: 'temperature', label: 'temp', unit: '°C', color: '#52525b' },
  { key: 'fanSpeed', label: 'fan', unit: '%', color: '#3f3f46' },
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

  const tooltipStyle = {
    backgroundColor: 'rgba(8,8,10,0.92)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#e8e8e9',
    fontFamily: 'var(--mono-font)',
    fontSize: '11px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  };

  return (
    <section className="telemetry-panel">
      <div className="telemetry-head">
        <div>
          <div className="eyebrow">gpu telemetry</div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>GPU {gpu.id} history</h2>
        </div>
        <div className="filter-pill-row">
          {METRICS.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={`filter-pill ${visible.has(metric.key) ? 'active' : ''}`}
              onClick={() => toggle(metric.key)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="telemetry-layout">
        <div className="telemetry-chart-box">
          {data.length < 2 ? (
            <div className="empty-state">Collecting GPU telemetry...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="timeStr"
                  tick={{ fill: '#3c3c42', fontSize: 10, fontFamily: 'var(--mono-font)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  minTickGap={30}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#3c3c42', fontSize: 10, fontFamily: 'var(--mono-font)' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => {
                    const metric = METRICS.find((item) => item.key === name);
                    return [`${value}${metric?.unit ?? ''}`, metric?.label ?? name];
                  }}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as HistoryPoint | undefined;
                    return point?.timeStr ?? '';
                  }}
                />
                {METRICS.filter((metric) => visible.has(metric.key)).map((metric) => (
                  <Line
                    key={metric.key}
                    type="monotone"
                    dataKey={metric.key}
                    name={metric.key}
                    stroke={metric.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="telemetry-facts">
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
