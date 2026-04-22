export interface GPUProcess {
  pid: number;
  type: 'C' | 'G';
  name: string;
  gpuId: number;
  memoryUsage: number;
  user: string;
  uid: string;
  cmdLine: string;
}

export interface GPUData {
  id: number;
  name: string;
  temperature: number;
  powerDraw: number;
  powerLimit: number;
  fanSpeed: number;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  processes: GPUProcess[];
}

export interface HistoryPoint {
  timestamp: number;
  timeStr: string;
  utilization: number;
  memoryUsed: number;
  powerDraw: number;
  powerPercent: number;
  temperature: number;
  fanSpeed: number;
}

export interface SystemData {
  cpuUtilization: number;
  memoryUsed: number;
  memoryTotal: number;
}

export interface ResourceHistoryPoint {
  timestamp: number;
  timeStr: string;
  systemCpu: number;
  systemMemory: number;
  gpuAverage: number;
  gpuMemory: number;
  [key: `gpu${number}`]: number;
}

export interface DashboardData {
  timestamp: number;
  gpus: GPUData[];
  system?: SystemData;
  source?: 'nvml' | 'nvidia-smi' | 'unavailable';
  error?: string;
}

export interface AppState {
  // Data
  gpus: GPUData[];
  system: SystemData | null;
  history: Map<number, HistoryPoint[]>;
  resourceHistory: ResourceHistoryPoint[];
  isMock: boolean;
  isConnected: boolean;
  dataSource: 'live' | 'mock' | 'offline';
  statusMessage: string;
  lastUpdate: number;
  wsUrl: string;

  // UI
  expandedPanels: Set<string>;
  sortBy: 'memory' | 'pid' | 'name' | 'gpu' | 'user';
  sortDesc: boolean;

  // Actions
  setGPUs: (gpus: GPUData[]) => void;
  setSystem: (system: SystemData | null) => void;
  updateHistory: (gpuId: number, point: HistoryPoint) => void;
  setConnectionStatus: (connected: boolean, mock: boolean) => void;
  setDataSource: (source: 'live' | 'mock' | 'offline', message: string) => void;
  togglePanel: (id: string) => void;
  setSort: (by: 'memory' | 'pid' | 'name' | 'gpu' | 'user') => void;
}
