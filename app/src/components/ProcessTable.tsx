import { Fragment, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Copy,
  PanelRightOpen,
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
  const [inspected, setInspected] = useState<GPUProcess | null>(null);

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

  const copyCommand = (command: string) => {
    void navigator.clipboard?.writeText(command);
  };

  const renderSortIcon = (col: SortColumn) => {
    if (sortBy !== col) return <ArrowUpDown size={13} className="sort-muted" />;
    return sortDesc ? <ArrowDown size={13} /> : <ArrowUp size={13} />;
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
          <p className="eyebrow">activity</p>
          <h2>GPU processes</h2>
          <span>{visible.length} shown / {processes.length} total / sum vram {formatMemory(totalVram)}</span>
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

      <div className="grid-table process-grid-table">
        <div className="grid-row grid-head">
          <div>{header('gpu', 'gpu')}</div>
          <div>{header('pid', 'pid')}</div>
          <div>{header('user', 'user')}</div>
          <div>uid</div>
          <div>type</div>
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
                <div className="mono muted">GPU {proc.gpuId}</div>
                <div className="mono strong">{proc.pid}</div>
                <div className="truncate-cell strong" title={proc.user}>{proc.user}</div>
                <div className="mono muted">{proc.uid}</div>
                <div><span className="process-type">{proc.type}</span></div>
                <div className="align-right mono strong">{formatMemory(proc.memoryUsage)}</div>
                <div className="command-pill" title={command}>
                  <code>{command}</code>
                </div>
                <div className="align-right">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setInspected(proc)}
                    aria-label="Inspect process"
                  >
                    <PanelRightOpen size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => toggleExpanded(rowId)}
                    aria-label={isExpanded ? 'Collapse command' : 'Expand command'}
                  >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="process-detail">
                  <div>
                    <span>command</span>
                    <code>{command}</code>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => copyCommand(command)}
                    aria-label="Copy command"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </Fragment>
          );
        })}

        {visible.length === 0 && <div className="empty-state">No GPU processes match the filters.</div>}
      </div>

      {inspected && (
        <div className="inspector-backdrop" onClick={() => setInspected(null)}>
          <aside className="inspector-panel" onClick={(event) => event.stopPropagation()}>
            <div className="inspector-head">
              <div>
                <p className="eyebrow">process</p>
                <h2>{inspected.name}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setInspected(null)}>
                <ChevronRight size={16} />
              </button>
            </div>
            <dl className="inspector-facts">
              <div><dt>GPU</dt><dd>GPU {inspected.gpuId}</dd></div>
              <div><dt>PID</dt><dd>{inspected.pid}</dd></div>
              <div><dt>User</dt><dd>{inspected.user}</dd></div>
              <div><dt>UID</dt><dd>{inspected.uid}</dd></div>
              <div><dt>Type</dt><dd>{inspected.type}</dd></div>
              <div><dt>VRAM</dt><dd>{formatMemory(inspected.memoryUsage)}</dd></div>
            </dl>
            <div className="inspector-command">
              <span>command</span>
              <code>{inspected.cmdLine || inspected.name}</code>
              <button
                type="button"
                onClick={() => copyCommand(inspected.cmdLine || inspected.name)}
              >
                copy command
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
