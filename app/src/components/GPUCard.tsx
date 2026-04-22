import { HardDrive, Zap, Thermometer } from 'lucide-react';
import { motion } from 'framer-motion';
import type { GPUData } from '@/types';
import { TemperatureBar } from './TemperatureBar';
import { PowerRing } from './PowerRing';
import { FanIndicator } from './FanIndicator';

interface Props {
  gpu: GPUData;
  index: number;
}

export function GPUCard({ gpu, index }: Props) {
  const memPercent = Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100);
  const isDanger = gpu.temperature > 75 || gpu.utilization > 90;
  const isWarning = gpu.temperature > 50 || gpu.utilization > 70;

  const cardClass = isDanger
    ? 'gpu-card gpu-card-danger'
    : isWarning
      ? 'gpu-card gpu-card-warning'
      : 'gpu-card';

  return (
    <motion.div
      className={cardClass}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive size={16} className="text-[var(--accent-primary)]" />
          <span className="text-sm font-bold">
            GPU {gpu.id}: {gpu.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Zap size={12} className="text-amber-600" />
            <motion.span
              className="text-xs font-bold tabular-nums"
              key={gpu.utilization}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.15 }}
            >
              {gpu.utilization}%
            </motion.span>
          </div>
          <div className="flex items-center gap-1">
            <Thermometer size={12} className="text-[var(--accent-secondary)]" />
            <span
              className="text-xs font-bold tabular-nums"
              style={{
                color:
                  gpu.temperature > 75
                    ? 'var(--accent-secondary)'
                    : gpu.temperature > 50
                      ? 'var(--temp-warm)'
                      : 'var(--accent-primary)',
              }}
            >
              {gpu.temperature}°C
            </span>
          </div>
        </div>
      </div>

      {/* Main Metrics */}
      <div className="flex items-center justify-between gap-4">
        <TemperatureBar gpu={gpu} />
        <PowerRing gpu={gpu} />
        <FanIndicator gpu={gpu} />

        {/* Memory & Utilization Summary */}
        <div className="flex-1 ml-4 space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="metric-label">GPU UTILIZATION</span>
              <motion.span
                className="text-lg font-bold tabular-nums"
                style={{
                  color:
                    gpu.utilization > 85
                      ? 'var(--accent-secondary)'
                      : gpu.utilization > 60
                        ? 'var(--temp-warm)'
                        : 'var(--accent-primary)',
                }}
                key={gpu.utilization}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                {gpu.utilization}%
              </motion.span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundColor:
                    gpu.utilization > 85
                      ? 'var(--accent-secondary)'
                      : gpu.utilization > 60
                        ? 'var(--temp-warm)'
                        : 'var(--accent-primary)',
                }}
                animate={{ width: `${gpu.utilization}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="metric-label">VRAM</span>
              <span className="text-sm font-semibold tabular-nums">
                <motion.span
                  key={gpu.memoryUsed}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {(gpu.memoryUsed / 1024).toFixed(1)}
                </motion.span>
                <span className="text-[var(--text-secondary)]">
                  {' '}
                  / {(gpu.memoryTotal / 1024).toFixed(0)} GB
                </span>
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-neutral-500"
                animate={{ width: `${memPercent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
            <span>Processes: {gpu.processes.length}</span>
            <span>Power: {gpu.powerDraw}W / {gpu.powerLimit}W</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
