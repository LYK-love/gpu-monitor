import { create } from 'zustand';
import type { GPUData, HistoryPoint, AppState, SystemData, ResourceHistoryPoint } from '@/types';

declare global {
  interface Window {
    __GPUMON_CONFIG__?: {
      fontFamily?: string;
      fontCssUrl?: string;
      wsUrl?: string;
    };
  }
}

// ── Mock Data Engine ───────────────────────────────────────────

const GPU_NAMES = [
  'NVIDIA GeForce RTX 4090',
  'NVIDIA GeForce RTX 4080 SUPER',
  'NVIDIA GeForce RTX 3090 Ti',
  'NVIDIA A100 80GB PCIe',
  'NVIDIA RTX A6000',
];

const PROCESS_NAMES = [
  'train_model',
  'inference',
  'stable_diffusion',
  'data_preprocessing',
  'eval_model',
  'torchrun --nproc_per_node=2 train.py',
  'jupyter-lab',
  'nvcc cuda_kernel.cu',
  'benchmark',
  'finetune_lora',
  'test_model',
  'export_onnx',
];

const USERS = [
  { name: 'root', uid: '0' },
  { name: 'ubuntu', uid: '1000' },
  { name: 'researcher', uid: '1001' },
  { name: 'ai-user', uid: '1002' },
  { name: 'dev', uid: '1003' },
  { name: 'admin', uid: '1004' },
];

let mockPidCounter = 10000;
// Mock data engine state

function defaultWsUrl(): string {
  if (window.__GPUMON_CONFIG__?.wsUrl) {
    return window.__GPUMON_CONFIG__.wsUrl;
  }
  const host = window.location.hostname || 'localhost';
  return `ws://${host}:8765/gpu-stream`;
}

function createInitialMock(): GPUData[] {
  const count = 2;
  const gpus: GPUData[] = [];
  for (let i = 0; i < count; i++) {
    gpus.push({
      id: i,
      name: GPU_NAMES[i % GPU_NAMES.length],
      temperature: 40 + Math.floor(Math.random() * 10),
      powerDraw: 50 + Math.floor(Math.random() * 30),
      powerLimit: 350 + Math.floor(Math.random() * 100),
      fanSpeed: 30 + Math.floor(Math.random() * 10),
      utilization: Math.floor(Math.random() * 15),
      memoryUsed: 200 + Math.floor(Math.random() * 500),
      memoryTotal: 24000 + Math.floor(Math.random() * 2000),
      processes: [],
    });
  }
  return gpus;
}

function randomWalk(value: number, min: number, max: number, delta: number): number {
  const change = (Math.random() - 0.5) * 2 * delta;
  let newValue = value + change;
  newValue = Math.max(min, Math.min(max, newValue));
  return Math.round(newValue);
}

function updateMockData(prev: GPUData[]): GPUData[] {
  const updated: GPUData[] = prev.map((gpu) => {
    const newUtil = randomWalk(gpu.utilization, 0, 100, 12);
    const tempBase = 35 + (newUtil * 0.45);
    const newTemp = Math.round(tempBase + (Math.random() - 0.5) * 4);
    const newPower = Math.round(gpu.powerLimit * (newUtil / 100) * 0.75 + (Math.random() - 0.5) * 15);
    const newFan = Math.min(100, Math.round(newTemp * 0.8 + (Math.random() - 0.5) * 5));
    const memDelta = Math.random() > 0.7 ? Math.floor(Math.random() * 200) : 0;
    const newMemUsed = Math.min(gpu.memoryTotal, Math.max(200, gpu.memoryUsed + memDelta));

    let processes = [...gpu.processes];

    // Randomly add process
    if (Math.random() < 0.08 && processes.length < 8) {
      mockPidCounter++;
      const user = USERS[Math.floor(Math.random() * USERS.length)];
      const command = PROCESS_NAMES[Math.floor(Math.random() * PROCESS_NAMES.length)];
      processes.push({
        pid: mockPidCounter,
        type: Math.random() > 0.3 ? 'C' : 'G',
        name: command.split(' ')[0],
        gpuId: gpu.id,
        memoryUsage: 100 + Math.floor(Math.random() * 4000),
        user: user.name,
        uid: user.uid,
        cmdLine: command,
      });
    }

    // Randomly remove process
    if (Math.random() < 0.04 && processes.length > 0) {
      const idx = Math.floor(Math.random() * processes.length);
      processes.splice(idx, 1);
    }

    // Update process memory
    processes = processes.map((p) => ({
      ...p,
      memoryUsage: Math.max(50, p.memoryUsage + Math.floor((Math.random() - 0.5) * 50)),
    }));

    return {
      ...gpu,
      utilization: newUtil,
      temperature: Math.max(35, Math.min(95, newTemp)),
      powerDraw: Math.max(20, Math.min(gpu.powerLimit, newPower)),
      fanSpeed: Math.max(0, Math.min(100, newFan)),
      memoryUsed: newMemUsed,
      processes,
    };
  });

  return updated;
}

// ── Zustand Store ──────────────────────────────────────────────

export const useGPUStore = create<AppState>((set, get) => ({
  gpus: [],
  system: null,
  history: new Map(),
  resourceHistory: [],
  isMock: true,
  isConnected: false,
  dataSource: 'mock',
  statusMessage: 'Mock data',
  lastUpdate: Date.now(),
  wsUrl: defaultWsUrl(),
  expandedPanels: new Set(['processes']),
  sortBy: 'memory',
  sortDesc: true,

  setGPUs: (gpus) => {
    const now = Date.now();
    const state = get();
    const newHistory = new Map(state.history);
    const timeStr = new Date(now).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    gpus.forEach((gpu) => {
      const existing = newHistory.get(gpu.id) || [];
      const newPoint: HistoryPoint = {
        timestamp: now,
        timeStr,
        utilization: gpu.utilization,
        memoryUsed: Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100),
        powerDraw: gpu.powerDraw,
        powerPercent: gpu.powerLimit ? Math.round((gpu.powerDraw / gpu.powerLimit) * 100) : 0,
        temperature: gpu.temperature,
        fanSpeed: gpu.fanSpeed,
      };
      const updated = [...existing, newPoint].slice(-60);
      newHistory.set(gpu.id, updated);
    });

    const gpuAverage = gpus.length > 0
      ? Math.round(gpus.reduce((sum, gpu) => sum + gpu.utilization, 0) / gpus.length)
      : 0;
    const totalGpuMemoryUsed = gpus.reduce((sum, gpu) => sum + gpu.memoryUsed, 0);
    const totalGpuMemory = gpus.reduce((sum, gpu) => sum + gpu.memoryTotal, 0);
    const system = state.system;
    const resourcePoint: ResourceHistoryPoint = {
      timestamp: now,
      timeStr,
      systemCpu: Math.round(system?.cpuUtilization ?? 0),
      systemMemory: system?.memoryTotal
        ? Math.round((system.memoryUsed / system.memoryTotal) * 100)
        : 0,
      gpuAverage,
      gpuMemory: totalGpuMemory ? Math.round((totalGpuMemoryUsed / totalGpuMemory) * 100) : 0,
    };
    gpus.forEach((gpu) => {
      resourcePoint[`gpu${gpu.id}`] = gpu.utilization;
    });

    set({
      gpus,
      history: newHistory,
      resourceHistory: [...state.resourceHistory, resourcePoint].slice(-90),
      lastUpdate: now,
    });
  },

  setSystem: (system: SystemData | null) => set({ system }),

  updateHistory: (gpuId, point) => {
    const state = get();
    const newHistory = new Map(state.history);
    const existing = newHistory.get(gpuId) || [];
    newHistory.set(gpuId, [...existing, point].slice(-60));
    set({ history: newHistory });
  },

  setConnectionStatus: (connected, mock) =>
    set({
      isConnected: connected,
      isMock: mock,
      dataSource: connected ? (mock ? 'mock' : 'live') : 'offline',
      statusMessage: connected ? (mock ? 'Mock data' : 'Live GPU data') : 'Disconnected',
    }),

  setDataSource: (source, message) =>
    set({
      dataSource: source,
      isMock: source === 'mock',
      isConnected: source !== 'offline',
      statusMessage: message,
    }),

  togglePanel: (id) =>
    set((state) => {
      const next = new Set(state.expandedPanels);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedPanels: next };
    }),

  setSort: (by) =>
    set((state) => ({
      sortBy: by,
      sortDesc: state.sortBy === by ? !state.sortDesc : true,
    })),
}));

// ── Mock Engine Hook ───────────────────────────────────────────

let mockInterval: ReturnType<typeof setInterval> | null = null;

export function startMockEngine() {
  if (mockInterval) return;

  const store = useGPUStore.getState();
  if (store.gpus.length === 0) {
    const initial = createInitialMock();
    store.setGPUs(initial);
  }

  mockInterval = setInterval(() => {
    const state = useGPUStore.getState();
    if (state.isMock) {
      useGPUStore.getState().setSystem({
        cpuUtilization: randomWalk(state.system?.cpuUtilization ?? 35, 4, 95, 10),
        memoryUsed: randomWalk(state.system?.memoryUsed ?? 32000, 16000, 128000, 2800),
        memoryTotal: state.system?.memoryTotal ?? 128000,
      });
      const updated = updateMockData(state.gpus);
      useGPUStore.getState().setGPUs(updated);
    }
  }, 1000);
}

export function stopMockEngine() {
  if (mockInterval) {
    clearInterval(mockInterval);
    mockInterval = null;
  }
}
