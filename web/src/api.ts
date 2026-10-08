import type {
  AddressPreview,
  CheckPage,
  CheckQuery,
  ProbeResult,
  Series,
  Target,
  TargetInput,
  TargetList,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return "Cannot reach the monitor API.";
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}

function windowQuery(start: Date, end: Date): string {
  return new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  }).toString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            return String(item.msg);
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
    }
  } catch {
    // Response was not JSON.
  }
  return `Request failed (${response.status}).`;
}

export function getMeta(): Promise<{ retention_days: number }> {
  return request("/api/meta");
}

export function getTargets(start: Date, end: Date): Promise<TargetList> {
  return request(`/api/targets?${windowQuery(start, end)}`);
}

export function getTarget(id: string): Promise<Target> {
  return request(`/api/targets/${id}`);
}

export function createTarget(body: TargetInput): Promise<Target> {
  return request("/api/targets", { method: "POST", body: JSON.stringify(body) });
}

export function updateTarget(id: string, body: Partial<TargetInput>): Promise<Target> {
  return request(`/api/targets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteTarget(id: string): Promise<void> {
  return request(`/api/targets/${id}`, { method: "DELETE" });
}

export function probeTarget(id: string): Promise<ProbeResult> {
  return request(`/api/targets/${id}/probe`, { method: "POST" });
}

export function previewProbe(address: string, timeoutMs: number): Promise<ProbeResult> {
  return request("/api/probe", {
    method: "POST",
    body: JSON.stringify({ address, timeout_ms: timeoutMs }),
  });
}

export function parseAddress(address: string): Promise<AddressPreview> {
  return request("/api/address", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export function getSeries(id: string, start: Date, end: Date): Promise<Series> {
  return request(`/api/targets/${id}/series?${windowQuery(start, end)}`);
}

export function getChecks(
  id: string,
  start: Date,
  end: Date,
  query: CheckQuery,
): Promise<CheckPage> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    status: query.status,
    limit: String(query.limit),
    offset: String(query.offset),
  });
  if (query.q) params.set("q", query.q);
  return request(`/api/targets/${id}/checks?${params.toString()}`);
}
