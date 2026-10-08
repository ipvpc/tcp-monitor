import { useRef, useState, type PointerEvent } from "react";
import { formatMs, formatStampSeconds } from "../format";
import { windowError } from "../range";
import type { SeriesPoint } from "../types";

const WIDTH = 800;
const HEIGHT = 280;
const LEFT = 56;
const RIGHT = 16;
const TOP = 18;
const BOTTOM = 36;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
const PLOT_BOTTOM = TOP + PLOT_HEIGHT;

type Props = {
  start: string;
  end: string;
  bucketSeconds: number;
  points: SeriesPoint[];
  focus: { start: string; end: string } | null;
  onZoom: (start: Date, end: Date) => void;
  onFocus: (start: Date, end: Date) => void;
};

type Drag = { x0: number; x1: number };

export function LatencyChart({ start, end, bucketSeconds, points, focus, onZoom, onFocus }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<SeriesPoint | null>(null);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const span = Math.max(1, endMs - startMs);
  const values = points.flatMap((point) =>
    [point.max_ms, point.avg_ms, point.min_ms].filter((value): value is number => value != null),
  );
  const yMax = Math.max(1, ...values) * 1.2;

  function xFor(time: number): number {
    return LEFT + ((time - startMs) / span) * PLOT_WIDTH;
  }

  function yFor(value: number): number {
    return TOP + (1 - value / yMax) * PLOT_HEIGHT;
  }

  function timeFor(x: number): Date {
    const clamped = Math.min(LEFT + PLOT_WIDTH, Math.max(LEFT, x));
    return new Date(startMs + ((clamped - LEFT) / PLOT_WIDTH) * span);
  }

  function viewX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return LEFT;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return LEFT;
    return ((clientX - rect.left) / rect.width) * WIDTH;
  }

  function nearest(x: number): SeriesPoint | null {
    let best: SeriesPoint | null = null;
    let distance = 28;
    for (const point of points) {
      const delta = Math.abs(xFor(new Date(point.t).getTime()) - x);
      if (delta < distance) {
        distance = delta;
        best = point;
      }
    }
    return best;
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { x0: viewX(event.clientX), x1: viewX(event.clientX) };
    dragRef.current = next;
    setDrag(next);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const x = viewX(event.clientX);
    if (dragRef.current) {
      const next = { ...dragRef.current, x1: x };
      dragRef.current = next;
      setDrag(next);
    }
    setHover(nearest(x));
  }

  function onPointerUp() {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    const left = Math.min(current.x0, current.x1);
    const right = Math.max(current.x0, current.x1);
    if (right - left < 8) {
      const point = nearest(left);
      if (!point) return;
      const bucketStart = new Date(point.t);
      onFocus(bucketStart, new Date(bucketStart.getTime() + bucketSeconds * 1000));
      return;
    }
    const nextStart = timeFor(left);
    const nextEnd = timeFor(right);
    if (!windowError(nextStart, nextEnd)) onZoom(nextStart, nextEnd);
  }

  const groups = lineGroups(points, bucketSeconds);
  const ticks = [yMax, yMax / 2, 0];
  const hoverX = hover ? xFor(new Date(hover.t).getTime()) : null;

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          points.length === 0
            ? "Latency chart with no checks in this window"
            : `Latency chart with ${points.length} time buckets`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!dragRef.current) setHover(null);
        }}
      >
        {ticks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line className="grid-line" x1={LEFT} x2={LEFT + PLOT_WIDTH} y1={y} y2={y} />
              <text className="axis" x={LEFT - 8} y={y + 4} textAnchor="end">
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}s` : `${Math.round(tick)}`}
              </text>
            </g>
          );
        })}
        {focus && (
          <rect
            className="focus-band"
            x={Math.min(xFor(new Date(focus.start).getTime()), xFor(new Date(focus.end).getTime()))}
            y={TOP}
            width={Math.max(1, Math.abs(xFor(new Date(focus.end).getTime()) - xFor(new Date(focus.start).getTime())))}
            height={PLOT_HEIGHT}
          />
        )}
        {groups.map((group) => (
          <path key={group[0]?.t ?? "empty"} className="band" d={areaPath(group, xFor, yFor)} />
        ))}
        {groups.map((group) => (
          <path key={`line-${group[0]?.t ?? "empty"}`} className="line" d={linePath(group, xFor, yFor)} />
        ))}
        {points.map((point) =>
          point.failures > 0 ? (
            <line
              key={`fail-${point.t}`}
              className="rug"
              x1={xFor(new Date(point.t).getTime())}
              x2={xFor(new Date(point.t).getTime())}
              y1={PLOT_BOTTOM + 4}
              y2={PLOT_BOTTOM + 12}
            />
          ) : null,
        )}
        {hover && hover.avg_ms != null && hoverX != null && (
          <circle className="dot" cx={hoverX} cy={yFor(hover.avg_ms)} r="4" />
        )}
        {drag && (
          <rect
            className="brush"
            x={Math.min(drag.x0, drag.x1)}
            y={TOP}
            width={Math.abs(drag.x1 - drag.x0)}
            height={PLOT_HEIGHT}
          />
        )}
        <text className="axis" x={LEFT} y={HEIGHT - 8}>
          {formatStampSeconds(start)}
        </text>
        <text className="axis" x={WIDTH - RIGHT} y={HEIGHT - 8} textAnchor="end">
          {formatStampSeconds(end)}
        </text>
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: `${(xFor(new Date(hover.t).getTime()) / WIDTH) * 100}%` }}>
          <strong>{formatStampSeconds(hover.t)}</strong>
          <span>avg {formatMs(hover.avg_ms)}</span>
          <span>
            min {formatMs(hover.min_ms)} · max {formatMs(hover.max_ms)}
          </span>
          <span>
            {hover.samples} checks · {hover.failures} failed
          </span>
        </div>
      )}
      {points.length === 0 && <p className="chart-empty">No checks in this window.</p>}
    </div>
  );
}

function lineGroups(points: SeriesPoint[], bucketSeconds: number): SeriesPoint[][] {
  const groups: SeriesPoint[][] = [];
  let current: SeriesPoint[] = [];
  let previous: number | null = null;
  for (const point of points) {
    const time = new Date(point.t).getTime();
    const gap = previous != null && time - previous > bucketSeconds * 1500;
    if (point.avg_ms == null || gap) {
      if (current.length) groups.push(current);
      current = [];
    }
    if (point.avg_ms != null) current.push(point);
    previous = time;
  }
  if (current.length) groups.push(current);
  return groups;
}

function linePath(
  group: SeriesPoint[],
  xFor: (time: number) => number,
  yFor: (value: number) => number,
): string {
  return group
    .map((point, index) => {
      const command = `${xFor(new Date(point.t).getTime())} ${yFor(point.avg_ms ?? 0)}`;
      return `${index === 0 ? "M" : "L"} ${command}`;
    })
    .join(" ");
}

function areaPath(
  group: SeriesPoint[],
  xFor: (time: number) => number,
  yFor: (value: number) => number,
): string {
  if (group.length === 0) return "";
  const top = group.map((point) => {
    const y = yFor(point.max_ms ?? point.avg_ms ?? 0);
    return `${xFor(new Date(point.t).getTime())} ${y}`;
  });
  const bottom = [...group].reverse().map((point) => {
    const y = yFor(point.min_ms ?? point.avg_ms ?? 0);
    return `${xFor(new Date(point.t).getTime())} ${y}`;
  });
  const rest = top.slice(1);
  const onward = rest.length > 0 ? ` L ${rest.join(" L ")}` : "";
  return `M ${top[0]}${onward} L ${bottom.join(" L ")} Z`;
}
