import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import { GPUDetail } from '@/components/GPUDetail';
import { GPUOverview } from '@/components/GPUOverview';
import { ProcessTable } from '@/components/ProcessTable';
import { ResourceChart } from '@/components/ResourceChart';
import { StatusBar } from '@/components/StatusBar';
import { useGPUStore, startMockEngine, stopMockEngine } from '@/store/gpuStore';
import type { DashboardData } from '@/types';

type View = 'overview' | 'processes' | 'telemetry';

function WebSocketConnector() {
  const wsRef = useRef<WebSocket | null>(null);
  const { wsUrl, setConnectionStatus, setDataSource, setGPUs, setSystem } = useGPUStore();

  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus(true, false);
          stopMockEngine();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as DashboardData;
            if (data.gpus && data.gpus.length > 0) {
              stopMockEngine();
              setDataSource('live', `Live GPU data via ${data.source ?? 'backend'}`);
              setSystem(data.system ?? null);
              setGPUs(data.gpus);
            } else if (data.gpus) {
              setDataSource(
                'mock',
                data.error
                  ? `No real GPU data (${data.error}); showing mock data`
                  : 'No GPUs detected; showing mock data',
              );
              startMockEngine();
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          setConnectionStatus(false, true);
          startMockEngine();
          wsRef.current = null;
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setConnectionStatus(false, true);
        startMockEngine();
      }
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [setConnectionStatus, setDataSource, setGPUs, setSystem, wsUrl]);

  return null;
}

function App() {
  const gpus = useGPUStore((s) => s.gpus);
  const [view, setView] = useState<View>('overview');
  const [selectedGpuId, setSelectedGpuId] = useState<number | null>(null);

  // Start mock engine on mount
  useEffect(() => {
    startMockEngine();
    return () => stopMockEngine();
  }, []);

  const allProcesses = gpus.flatMap((g) => g.processes);
  const selectedGpu = useMemo(
    () => gpus.find((gpu) => gpu.id === selectedGpuId) ?? null,
    [gpus, selectedGpuId],
  );

  return (
    <div className="min-h-screen flex flex-col app-shell">
      <WebSocketConnector />
      <Header />

      <main className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="view-switcher" role="tablist" aria-label="Dashboard views">
          {(['overview', 'processes', 'telemetry'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={view === item ? 'active' : ''}
              onClick={() => {
                setView(item);
                setSelectedGpuId(null);
              }}
            >
              {item}
            </button>
          ))}
        </div>

        {selectedGpu ? (
          <GPUDetail gpu={selectedGpu} onBack={() => setSelectedGpuId(null)} />
        ) : (
          <>
            {view === 'overview' && (
              <>
                <GPUOverview gpus={gpus} onSelectGPU={setSelectedGpuId} />
                <ResourceChart compact onSelectGPU={setSelectedGpuId} />
              </>
            )}
            {view === 'processes' && <ProcessTable processes={allProcesses} />}
            {view === 'telemetry' && <ResourceChart onSelectGPU={setSelectedGpuId} />}
          </>
        )}
      </main>

      <StatusBar />
    </div>
  );
}

export default App;
