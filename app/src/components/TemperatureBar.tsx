import { motion } from 'framer-motion';
import type { GPUData } from '@/types';

interface Props {
  gpu: GPUData;
}

export function TemperatureBar({ gpu }: Props) {
  const { temperature } = gpu;
  const height = Math.min(100, Math.max(10, (temperature / 100) * 100));

  let color = 'var(--accent-primary)';
  if (temperature > 75) color = 'var(--accent-secondary)';
  else if (temperature > 50) color = 'var(--temp-warm)';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="metric-label">TEMP</span>
      <div className="relative w-6 h-24 bg-[var(--bg-tertiary)] rounded-sm overflow-hidden">
        <motion.div
          className="absolute bottom-0 left-0 right-0 rounded-sm"
          style={{ backgroundColor: color }}
          initial={{ height: '0%' }}
          animate={{ height: `${height}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between px-0.5 py-1 pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-full h-px bg-[var(--border-color)] opacity-50" />
          ))}
        </div>
      </div>
      <motion.span
        className="text-sm font-bold tabular-nums"
        style={{ color }}
        key={temperature}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        {temperature}°C
      </motion.span>
    </div>
  );
}
