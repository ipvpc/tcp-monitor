import { useEffect, useState } from "react";
import { deleteTarget, errorMessage, getTargets, updateTarget } from "../api";
import { formatAgo, formatInterval, formatMs, formatUptime, kindLabel, statusOf } from "../format";
import { boundsFor, type TimeWindow } from "../range";
import type { TargetSummary } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { Sparkline } from "./Sparkline";
import { TargetForm } from "./TargetForm";

type Props = {
  search: string;
  timeWindow: TimeWindow;
  onOpen: (id: string) => void;
};

export function TargetBoard({ search, timeWindow, onOpen }: Props) {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TargetSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TargetSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let token = 0;
    const load = async () => {
      const current = ++token;
      const bounds = boundsFor(timeWindow);
      try {
        const data = await getTargets(bounds.start, bounds.end);
        if (current !== token) return;
        setTargets(data.targets);
        setError(null);
      } catch (caught) {
        if (current !== token) return;
        setError(errorMessage(caught));
      } finally {
        if (current === token) setLoaded(true);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      token += 1;
      window.clearInterval(timer);
    };
  }, [search, timeWindow, refreshKey]);

  async function toggle(target: TargetSummary) {
    try {
      await updateTarget(target.id, { enabled: !target.enabled });
      setRefreshKey((value) => value + 1);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTarget(pendingDelete.id);
      setPendingDelete(null);
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setDeleteError(errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  const needle = filter.trim().toLowerCase();
  const visible = targets.filter((target) => {
    const haystack = `${target.name} ${target.endpoint} ${target.host}`.toLowerCase();
    return haystack.includes(needle);
  });

  return (
    <section>
      <div className="toolbar">
        <label className="search">
          <span>Filter targets</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Name, host, or URL"
          />
        </label>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          Add target
        </button>
      </div>
      {error && (
        <p className="banner bad" role="alert">
          {error}
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}
      {!loaded && <p className="empty-inline">Loading targets…</p>}
      {loaded && !error && targets.length === 0 && (
        <div className="empty">
          <h2>No targets yet</h2>
          <p>Add a host and port, or a URL. Each check is stored so you can search any stretch of time.</p>
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            Add target
          </button>
        </div>
      )}
      {loaded && targets.length > 0 && visible.length === 0 && (
        <p className="empty-inline">No targets match that filter.</p>
      )}
      <div className="grid">
        {visible.map((target) => {
          const status = statusOf(target);
          return (
            <article key={target.id} className={`card ${status.className}`}>
              <div className="card-top">
                <div>
                  <h2>
                    <button type="button" className="linkish" onClick={() => onOpen(target.id)}>
                      {target.name}
                    </button>
                  </h2>
                  <p className="endpoint">{target.endpoint}</p>
                </div>
                <span className={`pill ${status.className}`}>{status.label}</span>
              </div>
              <p className="metric">
                <strong>{formatMs(target.last_latency_ms)}</strong>
                <span>
                  {kindLabel(target.kind)} · {formatAgo(target.last_checked_at)} · every{" "}
                  {formatInterval(target.interval_seconds)}
                </span>
              </p>
              {target.last_ok === false && target.last_error && <p className="hint bad">{target.last_error}</p>}
              <Sparkline values={target.spark} down={target.last_ok === false} />
              <p className="card-stats">
                {target.stats.samples === 0
                  ? "No checks in this window"
                  : `avg ${formatMs(target.stats.avg_ms)} · p95 ${formatMs(target.stats.p95_ms)} · ${formatUptime(target.stats.uptime)} up`}
              </p>
              <div className="card-actions">
                <button type="button" onClick={() => onOpen(target.id)}>
                  History
                </button>
                <button type="button" onClick={() => setEditing(target)}>
                  Edit
                </button>
                <button type="button" onClick={() => void toggle(target)}>
                  {target.enabled ? "Pause" : "Resume"}
                </button>
                <button type="button" onClick={() => setPendingDelete(target)}>
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {creating && (
        <TargetForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
      {editing && (
        <TargetForm
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={`Remove ${pendingDelete.name}?`}
          body="The target and its latency history will be deleted."
          confirmLabel="Remove"
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!deleting) {
              setPendingDelete(null);
              setDeleteError(null);
            }
          }}
        />
      )}
    </section>
  );
}
