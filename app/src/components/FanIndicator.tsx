import { Fan } from 'lucide-react';
import { motion } from 'framer-motion';
import type { GPUData } from '@/types';

interface Props {
  gpu: GPUData;
}

export function FanIndicator({ gpu }: Props) {
  const { fanSpeed } = gpu;
  const spinDuration = fanSpeed > 0 ? 2 / (fanSpeed / 50 + 0.5) : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="metric-label">FAN</span>
      <div className="relative w-16 h-16 flex items-center justify-center">
        <motion.div
          animate={spinDuration > 0 ? { rotate: 360 } : {}}
          transition={
            spinDuration > 0
              ? { duration: spinDuration, repeat: Infinity, ease: 'linear' }
              : {}
          }
        >
          <Fan size={32} className="text-[var(--accent-primary)]" strokeWidth={1.5} />
        </motion.div>
      </div>
      <motion.span
        className="text-sm font-bold tabular-nums"
        key={fanSpeed}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        {fanSpeed}%
      </motion.span>
    </div>
  );
}
