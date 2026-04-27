import { useMemo, useState } from 'react';
import { CircleHelp, Search } from 'lucide-react';
import { useGPUStore } from '@/store/gpuStore';

function formatMemory(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${mib} MB`;
}

export function ProcessTable() {
  const gpus = useGPUStore((s) => s.gpus);
  const processGpuFilter = useGPUStore((s) => s.processGpuFilter);
  const processUserFilter = useGPUStore((s) => s.processUserFilter);
  const setProcessGpuFilter = useGPUStore((s) => s.setProcessGpuFilter);
  const toggleProcessUserFilter = useGPUStore((s) => s.toggleProcessUserFilter);

  const [query, setQuery] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const processes = useMemo(() => gpus.flatMap((gpu) => gpu.processes), [gpus]);

  const gpuOptions = useMemo(() => {
    return Array.from(new Set(processes.map((proc) => proc.gpuId))).sort((a, b) => a - b);
  }, [processes]);

  const userOptions = useMemo(() => {
    return Array.from(new Set(processes.map((proc) => proc.user))).sort();
  }, [processes]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return processes.filter((proc) => {
      const matchesGpu = processGpuFilter === 'all' || String(proc.gpuId) === processGpuFilter;
      const matchesUser = processUserFilter.size === 0 || processUserFilter.has(proc.user);
      const command = proc.cmdLine || proc.name;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        command.toLowerCase().includes(normalizedQuery) ||
        proc.user.toLowerCase().includes(normalizedQuery) ||
        String(proc.pid).includes(normalizedQuery);
      return matchesGpu && matchesUser && matchesQuery;
    });
  }, [processGpuFilter, processUserFilter, processes, query]);

  return (
    <section className="process-section">
      <div className="process-section-head">
        <div>
          <div className="section-title-row">
            <h2>Processes</h2>
            <button
              type="button"
              className={`info-trigger ${showInfo ? 'active' : ''}`}
              onClick={() => setShowInfo((current) => !current)}
              aria-expanded={showInfo}
              aria-label="Explain which processes appear in this table"
            >
              <CircleHelp size={14} />
            </button>
          </div>
          <span className="section-support">
            {visible.length} shown / {processes.length} total
          </span>
        </div>
        <div className="process-filters">
          <label className="process-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search PID, user, command"
            />
          </label>
          <div className="filter-pill-row">
            <button
              type="button"
              className={`filter-pill ${processGpuFilter === 'all' ? 'active' : ''}`}
              onClick={() => setProcessGpuFilter('all')}
            >
              All GPUs
            </button>
            {gpuOptions.map((gpuId) => (
              <button
                key={gpuId}
                type="button"
                className={`filter-pill ${processGpuFilter === String(gpuId) ? 'active' : ''}`}
                onClick={() => setProcessGpuFilter(String(gpuId))}
              >
                GPU {gpuId}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showInfo && (
        <div className="process-info-panel">
          <div className="process-info-title">What is listed here</div>
          <p>
            This table shows compute processes that currently hold GPU memory, based on
            `nvidia-smi --query-compute-apps`. Entries without GPU VRAM usage do not appear here.
          </p>
        </div>
      )}

      {userOptions.length > 0 && (
        <div className="process-user-filters">
          <div className="filter-pill-row">
            {userOptions.map((user) => (
              <button
                key={user}
                type="button"
                className={`filter-pill ${processUserFilter.has(user) ? 'active' : ''}`}
                onClick={() => toggleProcessUserFilter(user)}
              >
                {user}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="process-table-wrap">
        <table className="process-table">
          <thead>
            <tr>
              <th>GPU</th>
              <th>PID</th>
              <th>User</th>
              <th className="align-right">VRAM</th>
              <th>Command</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((proc) => (
              <tr key={`${proc.gpuId}:${proc.pid}`}>
                <td className="col-gpu">GPU {proc.gpuId}</td>
                <td className="col-pid">{proc.pid}</td>
                <td className="col-user" title={proc.user}>{proc.user}</td>
                <td className="col-vram">{formatMemory(proc.memoryUsage)}</td>
                <td className="col-cmd" title={proc.cmdLine || proc.name}>
                  {proc.cmdLine || proc.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="empty-state">No processes match the filters.</div>
        )}
      </div>
    </section>
  );
}
