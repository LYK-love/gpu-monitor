import { motion } from 'framer-motion';
import type { GPUData } from '@/types';

interface Props {
  gpu: GPUData;
}

export function PowerRing({ gpu }: Props) {
  const { powerDraw, powerLimit } = gpu;
  const percentage = Math.round((powerDraw / powerLimit) * 100);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  let color = 'var(--accent-primary)';
  if (percentage > 85) color = 'var(--accent-secondary)';
  else if (percentage > 60) color = 'var(--temp-warm)';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="metric-label">POWER</span>
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
          <circle
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            stroke="var(--bg-tertiary)"
            strokeWidth="6"
          />
          <motion.circle
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-sm font-bold tabular-nums"
            style={{ color }}
            key={powerDraw}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            {powerDraw}W
          </motion.span>
          <span className="text-[9px] text-[var(--text-secondary)]">{percentage}%</span>
        </div>
      </div>
      <span className="text-[10px] text-[var(--text-secondary)]">{powerLimit}W max</span>
    </div>
  );
}
