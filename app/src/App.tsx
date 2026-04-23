import { useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { GPUOverview } from '@/components/GPUOverview';
import { ProcessTable } from '@/components/ProcessTable';
import { useGPUStore, startMockEngine, stopMockEngine } from '@/store/gpuStore';
import type { DashboardData } from '@/types';

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

function SystemBar() {
  const { gpus, system, lastUpdate } = useGPUStore();

  const timeStr = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--';

  return (
    <div className="system-bar">
      <div className="system-bar-item">
        <span>CPU</span>
        <strong>{Math.round(system?.cpuUtilization ?? 0)}%</strong>
      </div>
      <div className="system-bar-item">
        <span>RAM</span>
        <strong>
          {system?.memoryTotal
            ? `${Math.round((system.memoryUsed / system.memoryTotal) * 100)}%`
            : '0%'}
        </strong>
      </div>
      <div className="system-bar-item">
        <span>GPUs</span>
        <strong>{gpus.length}</strong>
      </div>
      <div className="system-bar-item">
        <span>Updated</span>
        <strong>{timeStr}</strong>
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    startMockEngine();
    return () => stopMockEngine();
  }, []);

  return (
    <div className="min-h-screen flex flex-col app-shell">
      <WebSocketConnector />
      <Header />
      <SystemBar />

      <main className="flex-1 overflow-y-auto">
        <GPUOverview />
        <ProcessTable />
      </main>
    </div>
  );
}

export default App;
