import type { Kind } from "./types";

export function formatMs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value < 10) return `${value.toFixed(1)} ms`;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

export function formatUptime(value: number | null | undefined): string {
  if (value == null) return "—";
  const digits = value === 0 || value >= 99.95 ? 0 : 1;
  return `${value.toFixed(digits)}%`;
}

export function formatAgo(iso: string | null): string {
  if (!iso) return "not yet";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatStamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStampSeconds(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0 && seconds >= 3600) return `${seconds / 3600}h`;
  if (seconds % 60 === 0 && seconds >= 60) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function kindLabel(kind: Kind): string {
  if (kind === "tcp") return "TCP connect";
  if (kind === "http") return "HTTP response";
  return "HTTPS response";
}

export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function statusOf(target: { enabled: boolean; last_ok: boolean | null }): {
  className: string;
  label: string;
} {
  if (!target.enabled) return { className: "paused", label: "Paused" };
  if (target.last_ok === false) return { className: "down", label: "Down" };
  if (target.last_ok === true) return { className: "up", label: "Up" };
  return { className: "waiting", label: "Waiting" };
}
