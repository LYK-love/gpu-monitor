import { useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { GPUCard } from '@/components/GPUCard';
import { UtilizationChart } from '@/components/UtilizationChart';
import { ProcessTable } from '@/components/ProcessTable';
import { StatusBar } from '@/components/StatusBar';
import { useGPUStore, startMockEngine, stopMockEngine } from '@/store/gpuStore';
import type { DashboardData } from '@/types';

function WebSocketConnector() {
  const wsRef = useRef<WebSocket | null>(null);
  const { wsUrl, setConnectionStatus, setDataSource, setGPUs } = useGPUStore();

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
  }, [setConnectionStatus, setDataSource, setGPUs, wsUrl]);

  return null;
}

function App() {
  const gpus = useGPUStore((s) => s.gpus);

  // Start mock engine on mount
  useEffect(() => {
    startMockEngine();
    return () => stopMockEngine();
  }, []);

  const allProcesses = gpus.flatMap((g) => g.processes);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <WebSocketConnector />
      <Header />

      <main className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* GPU Overview Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {gpus.map((gpu, i) => (
            <GPUCard key={gpu.id} gpu={gpu} index={i} />
          ))}
        </div>

        {/* Process Table */}
        <ProcessTable processes={allProcesses} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {gpus.map((gpu) => (
            <UtilizationChart key={gpu.id} gpu={gpu} />
          ))}
        </div>
      </main>

      <StatusBar />
    </div>
  );
}

export default App;
