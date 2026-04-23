import { useMemo } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useGPUStore } from '@/store/gpuStore';
import type { ResourceHistoryPoint } from '@/types';

const DEVICE_COLORS = ['#e8e8e9', '#a1a1aa', '#6b6b74', '#52525b', '#3f3f46', '#27272a'];

const METRICS = [
  { id: 'utilization', label: 'Utilization', unit: '%', max: 100 },
  { id: 'memory', label: 'VRAM / RAM', unit: '%', max: 100 },
  { id: 'power', label: 'Power', unit: '%', max: 100 },
  { id: 'temperature', label: 'Temperature', unit: '°C', max: 100 },
  { id: 'fan', label: 'Fan', unit: '%', max: 100 },
];

interface Props {
  compact?: boolean;
}

export function ResourceChart({ compact = false }: Props) {
  const history = useGPUStore((s) => s.resourceHistory);
  const gpus = useGPUStore((s) => s.gpus);
  const system = useGPUStore((s) => s.system);
  const telemetryDevices = useGPUStore((s) => s.telemetryDevices);
  const telemetryMetric = useGPUStore((s) => s.telemetryMetric);
  const toggleTelemetryDevice = useGPUStore((s) => s.toggleTelemetryDevice);
  const setTelemetryMetric = useGPUStore((s) => s.setTelemetryMetric);

  const metricDef = METRICS.find((m) => m.id === telemetryMetric) ?? METRICS[0];

  const devices = useMemo(() => {
    const list: { id: string; label: string; color: string; dataKey: keyof ResourceHistoryPoint }[] = [];
    let colorIndex = 0;

    const hasGpuSelected = gpus.some((gpu) => telemetryDevices.has(`gpu${gpu.id}`));
    const showAllGpus = !hasGpuSelected;

    if (telemetryDevices.has('cpu')) {
      const key =
        telemetryMetric === 'utilization'
          ? 'systemCpu'
          : telemetryMetric === 'memory'
            ? 'systemMemory'
            : null;
      if (key) {
        list.push({ id: 'cpu', label: 'CPU', color: DEVICE_COLORS[colorIndex++], dataKey: key });
      }
    }

    gpus.forEach((gpu) => {
      if (!showAllGpus && !telemetryDevices.has(`gpu${gpu.id}`)) return;
      const suffix = telemetryMetric;
      const key = `gpu${gpu.id}_${suffix}` as keyof ResourceHistoryPoint;
      if (suffix === 'power' || suffix === 'temperature' || suffix === 'fan' || suffix === 'utilization' || suffix === 'memory') {
        list.push({
          id: `gpu-${gpu.id}`,
          label: `GPU ${gpu.id}`,
          color: DEVICE_COLORS[Math.min(colorIndex++, DEVICE_COLORS.length - 1)],
          dataKey: key,
        });
      }
    });

    return list;
  }, [gpus, telemetryDevices, telemetryMetric]);

  const compactMetrics = useMemo(() => {
    const list: {
      id: string;
      label: string;
      sublabel: string;
      value: number;
      color: string;
      dataKey: keyof ResourceHistoryPoint;
    }[] = [];

    list.push({
      id: 'cpu',
      label: 'CPU',
      sublabel: 'utilization',
      value: Math.round(system?.cpuUtilization ?? 0),
      color: '#e8e8e9',
      dataKey: 'systemCpu',
    });

    list.push({
      id: 'memory',
      label: 'Memory',
      sublabel: 'host used',
      value: system?.memoryTotal ? Math.round((system.memoryUsed / system.memoryTotal) * 100) : 0,
      color: '#a1a1aa',
      dataKey: 'systemMemory',
    });

    gpus.forEach((gpu, index) => {
      list.push({
        id: `gpu-${gpu.id}-util`,
        label: `GPU ${gpu.id}`,
        sublabel: 'utilization',
        value: gpu.utilization,
        color: DEVICE_COLORS[Math.min(index + 2, DEVICE_COLORS.length - 1)],
        dataKey: `gpu${gpu.id}_util` as keyof ResourceHistoryPoint,
      });
    });

    return list.slice(0, 5);
  }, [gpus, system]);

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

  if (compact) {
    return (
      <section className="resource-section">
        <div className="resource-topline">
          <h2>Telemetry</h2>
        </div>
        <div className="resource-tile-grid">
          {compactMetrics.map((metric) => (
            <article className="resource-tile" key={metric.id}>
              <div className="resource-tile-head">
                <div>
                  <span>{metric.label}</span>
                  <em>{metric.sublabel}</em>
                </div>
                <strong style={{ color: metric.color }}>{metric.value}%</strong>
              </div>
              <div className="tile-chart">
                {history.length < 2 ? (
                  <div className="empty-state">collecting</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: '#6b6b74' }}
                        formatter={(value: number) => [`${value}%`, metric.sublabel]}
                      />
                      <Line
                        type="monotone"
                        dataKey={metric.dataKey}
                        stroke={metric.color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="telemetry-panel">
      <div className="telemetry-head">
        <div>
          <div className="eyebrow">metrics</div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>Telemetry</h2>
        </div>
        <div className="filter-pill-row">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`filter-pill ${telemetryMetric === m.id ? 'active' : ''}`}
              onClick={() => setTelemetryMetric(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 24px 0', borderBottom: '1px solid var(--border)' }}>
        <div className="filter-pill-row" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`filter-pill ${telemetryDevices.has('cpu') ? 'active' : ''}`}
            onClick={() => toggleTelemetryDevice('cpu')}
          >
            CPU
          </button>
          {gpus.map((gpu) => (
            <button
              key={gpu.id}
              type="button"
              className={`filter-pill ${telemetryDevices.has(`gpu${gpu.id}`) ? 'active' : ''}`}
              onClick={() => toggleTelemetryDevice(`gpu${gpu.id}`)}
            >
              GPU {gpu.id}
            </button>
          ))}
        </div>
      </div>

      <div className="telemetry-layout">
        <div className="telemetry-chart-box">
          {history.length < 2 ? (
            <div className="empty-state">collecting data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="timeStr"
                  tick={{ fill: '#3c3c42', fontSize: 10, fontFamily: 'var(--mono-font)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  minTickGap={30}
                />
                <YAxis
                  domain={[0, metricDef.max]}
                  tick={{ fill: '#3c3c42', fontSize: 10, fontFamily: 'var(--mono-font)' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#6b6b74' }}
                  formatter={(value: number, name: string) => {
                    return [`${value}${metricDef.unit}`, name];
                  }}
                />
                {devices.map((device) => (
                  <Line
                    key={device.id}
                    type="monotone"
                    dataKey={device.dataKey}
                    name={device.label}
                    stroke={device.color}
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
          {devices.map((device) => {
            const last = history[history.length - 1];
            const val = last ? (last[device.dataKey] as number) : 0;
            return (
              <article key={device.id}>
                <span>{device.label}</span>
                <strong style={{ color: device.color }}>
                  {val}{metricDef.unit}
                </strong>
              </article>
            );
          })}
          {devices.length === 0 && (
            <div className="empty-state" style={{ minHeight: 80 }}>Select a device</div>
          )}
        </div>
      </div>
    </section>
  );
}
