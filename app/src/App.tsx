import { useEffect, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import { GPUOverview } from '@/components/GPUOverview';
import { ProcessTable } from '@/components/ProcessTable';
import { useGPUStore, startMockEngine, stopMockEngine } from '@/store/gpuStore';
import type { DashboardData } from '@/types';

const RECONNECT_DELAY_MS = 1500;
type ThemeMode = 'dark' | 'light';

function WebSocketConnector() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const { wsUrl, setConnectionStatus, setDataSource, setGPUs, setSystem } = useGPUStore();

  useEffect(() => {
    shouldReconnectRef.current = true;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function scheduleReconnect(message: string) {
      if (!shouldReconnectRef.current) {
        return;
      }
      clearReconnectTimer();
      setDataSource('mock', message);
      startMockEngine();
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, RECONNECT_DELAY_MS);
    }

    function connect() {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          clearReconnectTimer();
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
          wsRef.current = null;
          scheduleReconnect('Live GPU stream disconnected; retrying');
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        scheduleReconnect('Unable to connect to the GPU stream; retrying');
      }
    }

    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
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
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const storedTheme = window.localStorage.getItem('gpumon-theme');
    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    startMockEngine();
    return () => stopMockEngine();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('gpumon-theme', theme);
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col app-shell">
      <WebSocketConnector />
      <Header theme={theme} onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))} />
      <SystemBar />

      <main className="flex-1 overflow-y-auto">
        <GPUOverview />
        <ProcessTable />
      </main>
    </div>
  );
}

export default App;
