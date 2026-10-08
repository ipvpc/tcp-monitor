export type Kind = "tcp" | "http" | "https";

export type Target = {
  id: string;
  name: string;
  kind: Kind;
  host: string;
  port: number;
  path: string;
  endpoint: string;
  interval_seconds: number;
  timeout_ms: number;
  enabled: boolean;
  last_checked_at: string | null;
  last_ok: boolean | null;
  last_latency_ms: number | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type WindowStats = {
  samples: number;
  ok_count: number;
  uptime: number | null;
  min_ms: number | null;
  avg_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
};

export type TargetSummary = Target & {
  stats: WindowStats;
  spark: Array<number | null>;
};

export type TargetList = {
  start: string;
  end: string;
  retention_days: number;
  targets: TargetSummary[];
};

export type SeriesPoint = {
  t: string;
  avg_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  samples: number;
  failures: number;
};

export type Series = {
  start: string;
  end: string;
  bucket_seconds: number;
  stats: WindowStats;
  points: SeriesPoint[];
};

export type Check = {
  id: number;
  checked_at: string;
  ok: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
};

export type CheckPage = {
  total: number;
  limit: number;
  offset: number;
  checks: Check[];
};

export type TargetInput = {
  name: string;
  address: string;
  interval_seconds: number;
  timeout_ms: number;
  enabled: boolean;
};

export type AddressPreview = {
  kind: Kind;
  endpoint: string;
  host: string;
  port: number;
  path: string;
};

export type ProbeResult = {
  ok: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
  endpoint: string;
  kind: Kind;
  checked_at?: string;
};

export type CheckQuery = {
  status: "all" | "up" | "down";
  q: string;
  limit: number;
  offset: number;
};
