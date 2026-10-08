import { useEffect, useMemo, useState } from "react";
import { getMeta } from "./api";
import { TargetBoard } from "./components/TargetBoard";
import { TargetDetail } from "./components/TargetDetail";
import { TimeRangeBar } from "./components/TimeRangeBar";
import { boundsFor, readWindow } from "./range";

export function App() {
  const { path, search, go } = useLocation();
  const timeWindow = useMemo(() => readWindow(search), [search]);
  const [now, setNow] = useState(() => new Date());
  const [retention, setRetention] = useState<number | null>(null);
  const bounds = boundsFor(timeWindow, now);
  const detailId = path.match(
    /^\/targets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  )?.[1];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void getMeta()
      .then((meta) => setRetention(meta.retention_days))
      .catch(() => setRetention(null));
  }, []);

  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="top">
        <div className="title-row">
          <button
            type="button"
            className="brand"
            onClick={() => {
              if (path !== "/") go(`/${search}`);
            }}
          >
            <Logo />
            <span>
              <strong>TCP Monitor</strong>
              <small>Latency for hosts, ports, and URLs</small>
            </span>
          </button>
        </div>
        <TimeRangeBar
          path={path}
          timeWindow={timeWindow}
          start={bounds.start}
          end={bounds.end}
          onNavigate={go}
        />
      </header>
      <main id="content">
        {detailId ? (
          <TargetDetail id={detailId} search={search} timeWindow={timeWindow} onNavigate={go} />
        ) : path === "/" ? (
          <TargetBoard
            search={search}
            timeWindow={timeWindow}
            onOpen={(id) => go(`/targets/${id}${search}`)}
          />
        ) : (
          <div className="empty">
            <h2>Page not found</h2>
            <button type="button" className="primary" onClick={() => go("/")}>
              Back to targets
            </button>
          </div>
        )}
      </main>
      <footer>
        {retention == null
          ? "Latency history is stored in Postgres."
          : retention > 0
            ? `Latency history is kept for ${retention} days.`
            : "Latency history is kept until you remove a target."}
      </footer>
    </div>
  );
}

function useLocation() {
  const [href, setHref] = useState(() => window.location.pathname + window.location.search);

  useEffect(() => {
    const sync = () => setHref(window.location.pathname + window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const url = new URL(href, "http://monitor.local");
  const go = (to: string, mode: "push" | "replace" = "push") => {
    const method = mode === "push" ? "pushState" : "replaceState";
    window.history[method](null, "", to);
    setHref(window.location.pathname + window.location.search);
  };
  return { path: url.pathname, search: url.search, go };
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" />
      <path d="M5 18h5l3-7 4 12 3-5h7" />
    </svg>
  );
}
