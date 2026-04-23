import { Fragment, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Copy,
  Search,
} from 'lucide-react';
import { useGPUStore } from '@/store/gpuStore';
import type { GPUProcess } from '@/types';

interface Props {
  processes: GPUProcess[];
}

type SortColumn = 'memory' | 'pid' | 'name' | 'gpu' | 'user';

function formatMemory(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${mib} MB`;
}

export function ProcessTable({ processes }: Props) {
  const { sortBy, sortDesc, setSort } = useGPUStore();
  const processGpuFilter = useGPUStore((s) => s.processGpuFilter);
  const processUserFilter = useGPUStore((s) => s.processUserFilter);
  const setProcessGpuFilter = useGPUStore((s) => s.setProcessGpuFilter);
  const toggleProcessUserFilter = useGPUStore((s) => s.toggleProcessUserFilter);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const gpuOptions = useMemo(() => {
    return Array.from(new Set(processes.map((proc) => proc.gpuId))).sort((a, b) => a - b);
  }, [processes]);

  const userOptions = useMemo(() => {
    return Array.from(new Set(processes.map((proc) => proc.user))).sort();
  }, [processes]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const list = processes.filter((proc) => {
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

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'memory') cmp = a.memoryUsage - b.memoryUsage;
      else if (sortBy === 'pid') cmp = a.pid - b.pid;
      else if (sortBy === 'gpu') cmp = a.gpuId - b.gpuId;
      else if (sortBy === 'user') cmp = a.user.localeCompare(b.user);
      else cmp = (a.cmdLine || a.name).localeCompare(b.cmdLine || b.name);
      return sortDesc ? -cmp : cmp;
    });

    return list;
  }, [processGpuFilter, processUserFilter, processes, query, sortBy, sortDesc]);

  const totalVram = visible.reduce((sum, proc) => sum + proc.memoryUsage, 0);

  const toggleExpanded = (rowId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const copyCommand = (command: string) => {
    void navigator.clipboard?.writeText(command);
  };

  const renderSortIcon = (col: SortColumn) => {
    if (sortBy !== col) return <ArrowUpDown size={12} className="sort-muted" />;
    return sortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />;
  };

  const header = (label: string, col: SortColumn, alignRight = false) => (
    <button
      type="button"
      className={`grid-sort ${alignRight ? 'align-right justify-end' : ''}`}
      onClick={() => setSort(col)}
    >
      {label}
      {renderSortIcon(col)}
    </button>
  );

  return (
    <section className="surface process-surface">
      <div className="surface-head process-head">
        <div>
          <div className="eyebrow">activity</div>
          <h2>Processes</h2>
          <span className="mono">
            {visible.length} shown / {processes.length} total / vram {formatMemory(totalVram)}
          </span>
        </div>

        <div className="process-tools">
          <label className="process-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <div className="filter-pill-row">
          <span className="faint" style={{ fontSize: 11, marginRight: 4 }}>Users:</span>
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

      <div className="grid-table process-grid-table">
        <div className="grid-row grid-head">
          <div>{header('gpu', 'gpu')}</div>
          <div>{header('pid', 'pid')}</div>
          <div>{header('user', 'user')}</div>
          <div>{header('vram', 'memory', true)}</div>
          <div>{header('command', 'name')}</div>
          <div />
        </div>

        {visible.map((proc) => {
          const rowId = `${proc.gpuId}:${proc.pid}`;
          const command = proc.cmdLine || proc.name;
          const isExpanded = expanded.has(rowId);

          return (
            <Fragment key={rowId}>
              <div className="grid-row">
                <div className="mono faint">GPU {proc.gpuId}</div>
                <div className="mono">{proc.pid}</div>
                <div className="truncate-cell" title={proc.user}>{proc.user}</div>
                <div className="align-right mono">{formatMemory(proc.memoryUsage)}</div>
                <div className="command-pill" title={command}>
                  <code>{command}</code>
                </div>
                <div className="align-right">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => copyCommand(command)}
                    aria-label="Copy command"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => toggleExpanded(rowId)}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="process-detail-inline">
                  <div>
                    <span>command</span>
                    <code>{command}</code>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}

        {visible.length === 0 && (
          <div className="empty-state" style={{ minHeight: 120 }}>
            No GPU processes match the filters.
          </div>
        )}
      </div>
    </section>
  );
}
