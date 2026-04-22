import { useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { useGPUStore } from '@/store/gpuStore';
import type { GPUData } from '@/types';

interface Props {
  gpu: GPUData;
}

interface ChartPoint {
  time: string;
  utilization: number;
  memory: number;
}

export function UtilizationChart({ gpu }: Props) {
  const history = useGPUStore((s) => s.history);

  const data: ChartPoint[] = useMemo(() => {
    const gpuHistory = history.get(gpu.id) || [];
    return gpuHistory.map((h) => ({
      time: h.timeStr,
      utilization: h.utilization,
      memory: h.memoryUsed,
    }));
  }, [gpu.id, history]);

  if (data.length < 2) {
    return (
      <div className="gpu-card flex items-center justify-center" style={{ height: 220 }}>
        <span className="text-[var(--text-secondary)] text-sm">
          Collecting data...
        </span>
      </div>
    );
  }

  return (
    <div className="gpu-card" style={{ height: 220 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="metric-label">GPU {gpu.id} — Utilization History</span>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
            GPU
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neutral-500" />
            VRAM
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`utilGrad-${gpu.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`memGrad-${gpu.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#737373" stopOpacity={0.14} />
              <stop offset="95%" stopColor="#737373" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: '#a3a3a3', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
            tickLine={false}
            axisLine={{ stroke: '#333333' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#a3a3a3', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#181818',
              border: '1px solid #333333',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'ui-monospace, monospace',
            }}
            labelStyle={{ color: '#a3a3a3' }}
            itemStyle={{ color: '#FFFFFF' }}
          />
          <Area
            type="monotone"
            dataKey="utilization"
            stroke="#60a5fa"
            strokeWidth={1.5}
            fill={`url(#utilGrad-${gpu.id})`}
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="memory"
            stroke="#737373"
            strokeWidth={1}
            fill={`url(#memGrad-${gpu.id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
