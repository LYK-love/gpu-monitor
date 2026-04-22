import { Fragment, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
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
  const [query, setQuery] = useState('');
  const [gpuFilter, setGpuFilter] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const gpuOptions = useMemo(() => {
    return Array.from(new Set(processes.map((proc) => proc.gpuId))).sort((a, b) => a - b);
  }, [processes]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const list = processes.filter((proc) => {
      const matchesGpu = gpuFilter === 'all' || String(proc.gpuId) === gpuFilter;
      const command = proc.cmdLine || proc.name;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        command.toLowerCase().includes(normalizedQuery) ||
        proc.user.toLowerCase().includes(normalizedQuery) ||
        String(proc.pid).includes(normalizedQuery);
      return matchesGpu && matchesQuery;
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
  }, [gpuFilter, processes, query, sortBy, sortDesc]);

  const totalVram = visible.reduce((sum, proc) => sum + proc.memoryUsage, 0);

  const toggleExpanded = (rowId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const renderSortIcon = (col: SortColumn) => {
    if (sortBy !== col) return <ArrowUpDown size={13} className="table-sort-muted" />;
    return sortDesc ? (
      <ArrowDown size={13} className="table-sort-active" />
    ) : (
      <ArrowUp size={13} className="table-sort-active" />
    );
  };

  return (
    <section className="process-panel">
      <div className="process-panel-header">
        <div>
          <h2>GPU Processes</h2>
          <p>
            {visible.length} shown / {processes.length} total / {formatMemory(totalVram)} VRAM
          </p>
        </div>

        <div className="process-tools">
          <label className="process-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="PID, user, command"
            />
          </label>

          <select value={gpuFilter} onChange={(event) => setGpuFilter(event.target.value)}>
            <option value="all">All GPUs</option>
            {gpuOptions.map((gpuId) => (
              <option key={gpuId} value={gpuId}>
                GPU {gpuId}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="process-table-wrap">
        <table className="data-table process-table">
          <thead>
            <tr>
              <th className="w-8" />
              <th className="sortable" onClick={() => setSort('gpu')}>
                <span>
                  GPU {renderSortIcon('gpu')}
                </span>
              </th>
              <th className="sortable" onClick={() => setSort('pid')}>
                <span>
                  PID {renderSortIcon('pid')}
                </span>
              </th>
              <th className="sortable" onClick={() => setSort('user')}>
                <span>
                  User {renderSortIcon('user')}
                </span>
              </th>
              <th>UID</th>
              <th>Type</th>
              <th className="sortable text-right" onClick={() => setSort('memory')}>
                <span className="justify-end">
                  VRAM {renderSortIcon('memory')}
                </span>
              </th>
              <th className="sortable" onClick={() => setSort('name')}>
                <span>
                  Command {renderSortIcon('name')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((proc) => {
              const rowId = `${proc.gpuId}:${proc.pid}`;
              const command = proc.cmdLine || proc.name;
              const isExpanded = expanded.has(rowId);

              return (
                <Fragment key={rowId}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => toggleExpanded(rowId)}
                        aria-label={isExpanded ? 'Collapse command' : 'Expand command'}
                      >
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </td>
                    <td className="tabular-nums">GPU {proc.gpuId}</td>
                    <td className="tabular-nums process-pid">{proc.pid}</td>
                    <td>{proc.user}</td>
                    <td className="tabular-nums text-muted">{proc.uid}</td>
                    <td>
                      <span className="process-type">{proc.type}</span>
                    </td>
                    <td className="text-right tabular-nums font-semibold">
                      {formatMemory(proc.memoryUsage)}
                    </td>
                    <td className="process-command-cell" title={command}>
                      <code>{command}</code>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="process-expanded-row">
                      <td />
                      <td colSpan={7}>
                        <code>{command}</code>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div className="process-empty">
            No GPU processes match the current filters.
          </div>
        )}
      </div>
    </section>
  );
}
