import { useEffect, useState } from "react";
import { errorMessage, getChecks } from "../api";
import { formatMs, formatStampSeconds } from "../format";
import { boundsFor, type TimeWindow } from "../range";
import type { CheckPage } from "../types";

type Focus = { start: Date; end: Date };

type Props = {
  targetId: string;
  search: string;
  timeWindow: TimeWindow;
  focus: Focus | null;
  onClearFocus: () => void;
  refreshKey: number;
};

const PAGE = 50;

export function HistoryTable({ targetId, search, timeWindow, focus, onClearFocus, refreshKey }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "up" | "down">("all");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CheckPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setOffset(0);
  }, [search, debounced, status, focus]);

  useEffect(() => {
    let token = 0;
    const load = async () => {
      const current = ++token;
      const bounds = focus ?? boundsFor(timeWindow);
      try {
        const next = await getChecks(targetId, bounds.start, bounds.end, {
          status,
          q: debounced,
          limit: PAGE,
          offset,
        });
        if (current !== token) return;
        setPage(next);
        setError(null);
      } catch (caught) {
        if (current !== token) return;
        setError(errorMessage(caught));
      } finally {
        if (current === token) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      token += 1;
      window.clearInterval(timer);
    };
  }, [targetId, search, timeWindow, debounced, status, offset, focus, refreshKey]);

  const total = page?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>History</h2>
        <label className="search">
          <span>Search this window</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Error text or status code"
          />
        </label>
      </div>
      <div className="filters" role="group" aria-label="Check result">
        {(["all", "up", "down"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {value === "all" ? "All" : value === "up" ? "Up" : "Down"}
          </button>
        ))}
      </div>
      {focus && (
        <p className="chip">
          Showing checks from {formatStampSeconds(focus.start.toISOString())} to{" "}
          {formatStampSeconds(focus.end.toISOString())}
          <button type="button" onClick={onClearFocus}>
            Show full window
          </button>
        </p>
      )}
      {error && (
        <p className="hint bad" role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Latency checks for the selected time window</caption>
          <thead>
            <tr>
              <th>Time</th>
              <th>Result</th>
              <th>Latency</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {page?.checks.map((check) => (
              <tr key={check.id}>
                <td>{formatStampSeconds(check.checked_at)}</td>
                <td>
                  <span className={`pill ${check.ok ? "up" : "down"}`}>{check.ok ? "Up" : "Down"}</span>
                </td>
                <td className="num">{formatMs(check.latency_ms)}</td>
                <td>{check.error ?? (check.status_code != null ? `HTTP ${check.status_code}` : "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && total === 0 && <p className="empty-inline">No checks in this window.</p>}
      </div>
      <div className="pager">
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          Previous
        </button>
        <span>
          {from}–{to} of {total}
        </span>
        <button type="button" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
          Next
        </button>
      </div>
    </section>
  );
}
