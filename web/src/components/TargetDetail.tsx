import { useEffect, useState } from "react";
import { deleteTarget, errorMessage, getSeries, getTarget, probeTarget, updateTarget } from "../api";
import { formatInterval, formatMs, formatUptime, kindLabel, statusOf } from "../format";
import { boundsFor, customSearch, type TimeWindow } from "../range";
import type { Series, Target } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { HistoryTable } from "./HistoryTable";
import { LatencyChart } from "./LatencyChart";
import { TargetForm } from "./TargetForm";

type Props = {
  id: string;
  search: string;
  timeWindow: TimeWindow;
  onNavigate: (to: string, mode?: "push" | "replace") => void;
};

export function TargetDetail({ id, search, timeWindow, onNavigate }: Props) {
  const [target, setTarget] = useState<Target | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    setFocus(null);
  }, [search]);

  useEffect(() => {
    setTarget(null);
    setSeries(null);
    setError(null);
    setProbeMessage(null);
  }, [id]);

  useEffect(() => {
    document.title = target ? `${target.name} · TCP Monitor` : "TCP Monitor";
    return () => {
      document.title = "TCP Monitor";
    };
  }, [target]);

  useEffect(() => {
    let token = 0;
    const load = async () => {
      const current = ++token;
      const bounds = boundsFor(timeWindow);
      try {
        const [nextTarget, nextSeries] = await Promise.all([
          getTarget(id),
          getSeries(id, bounds.start, bounds.end),
        ]);
        if (current !== token) return;
        setTarget(nextTarget);
        setSeries(nextSeries);
        setError(null);
      } catch (caught) {
        if (current !== token) return;
        setError(errorMessage(caught));
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
  }, [id, search, timeWindow, refreshKey]);

  async function toggle() {
    if (!target) return;
    try {
      await updateTarget(target.id, { enabled: !target.enabled });
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function runProbe() {
    setProbeMessage("Checking…");
    try {
      const result = await probeTarget(id);
      setProbeMessage(
        result.ok ? `Up in ${formatMs(result.latency_ms)}` : `Down. ${result.error ?? "Check failed."}`,
      );
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setProbeMessage(errorMessage(caught));
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTarget(id);
      onNavigate(`/${search}`);
    } catch (caught) {
      setDeleteError(errorMessage(caught));
      setDeleting(false);
    }
  }

  const status = target ? statusOf(target) : null;
  const stats = series?.stats;

  return (
    <section className="detail">
      <button type="button" className="back" onClick={() => onNavigate(`/${search}`)}>
        Targets
      </button>
      {!target && !error && <p className="empty-inline">Loading…</p>}
      {error && !target && (
        <div className="empty">
          <h2>Target unavailable</h2>
          <p>{error}</p>
        </div>
      )}
      {target && status && (
        <>
          <div className="detail-head">
            <div>
              <p className={`pill ${status.className}`}>{status.label}</p>
              <h2>{target.name}</h2>
              <p className="endpoint">{target.endpoint}</p>
              <p className="meta-line">
                {kindLabel(target.kind)} · every {formatInterval(target.interval_seconds)} · timeout{" "}
                {target.timeout_ms} ms
              </p>
            </div>
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button type="button" onClick={() => void runProbe()}>
                Probe now
              </button>
              <button type="button" onClick={() => void toggle()}>
                {target.enabled ? "Pause" : "Resume"}
              </button>
              <button type="button" onClick={() => setConfirming(true)}>
                Remove
              </button>
            </div>
          </div>
          {probeMessage && (
            <p className="hint" role="status">
              {probeMessage}
            </p>
          )}
          {error && (
            <p className="hint bad" role="alert">
              {error}
            </p>
          )}
          {stats && (
            <div className="stats">
              <Stat label="Uptime" value={formatUptime(stats.uptime)} />
              <Stat label="Average" value={formatMs(stats.avg_ms)} />
              <Stat label="p95" value={formatMs(stats.p95_ms)} />
              <Stat label="Min" value={formatMs(stats.min_ms)} />
              <Stat label="Max" value={formatMs(stats.max_ms)} />
              <Stat label="Checks" value={String(stats.samples)} />
            </div>
          )}
          {series && (
            <>
              <LatencyChart
                start={series.start}
                end={series.end}
                bucketSeconds={series.bucket_seconds}
                points={series.points}
                focus={
                  focus
                    ? { start: focus.start.toISOString(), end: focus.end.toISOString() }
                    : null
                }
                onZoom={(start, end) => onNavigate(`/targets/${id}?${customSearch(start, end)}`)}
                onFocus={(start, end) => setFocus({ start, end })}
              />
              <p className="hint">Drag across the chart to search a span of time. Click a point to list those checks.</p>
              <ul className="legend">
                <li>
                  <i className="swatch avg" /> Average
                </li>
                <li>
                  <i className="swatch range" /> Min to max
                </li>
                <li>
                  <i className="swatch fail" /> Failures
                </li>
              </ul>
            </>
          )}
          <HistoryTable
            targetId={id}
            search={search}
            timeWindow={timeWindow}
            focus={focus}
            onClearFocus={() => setFocus(null)}
            refreshKey={refreshKey}
          />
        </>
      )}
      {editing && target && (
        <TargetForm
          target={target}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={`Remove ${target?.name ?? "target"}?`}
          body="The target and its latency history will be deleted."
          confirmLabel="Remove"
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!deleting) {
              setConfirming(false);
              setDeleteError(null);
            }
          }}
        />
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
