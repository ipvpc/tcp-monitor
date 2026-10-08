export const PRESETS = [
  { id: "15m", label: "15m", ms: 15 * 60 * 1000 },
  { id: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { id: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

export type TimeWindow =
  | { type: "preset"; preset: PresetId }
  | { type: "custom"; start: Date; end: Date };

const PRESET_IDS = new Set<string>(PRESETS.map((preset) => preset.id));

export function readWindow(search: string): TimeWindow {
  const params = new URLSearchParams(search);
  const preset = params.get("preset");
  if (preset && PRESET_IDS.has(preset)) {
    return { type: "preset", preset: preset as PresetId };
  }
  const start = params.get("start");
  const end = params.get("end");
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate > startDate) {
      return { type: "custom", start: startDate, end: endDate };
    }
  }
  return { type: "preset", preset: "1h" };
}

export function boundsFor(window: TimeWindow, now = new Date()): { start: Date; end: Date } {
  if (window.type === "custom") return { start: window.start, end: window.end };
  const preset = PRESETS.find((item) => item.id === window.preset) ?? PRESETS[1];
  return { start: new Date(now.getTime() - preset.ms), end: now };
}

export function customSearch(start: Date, end: Date): string {
  return new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  }).toString();
}

export function windowError(start: Date, end: Date): string | null {
  const span = end.getTime() - start.getTime();
  if (Number.isNaN(span)) return "Enter a valid start and end.";
  if (span <= 0) return "The end of the window must be after the start.";
  if (span < 60_000) return "Choose a window of at least 1 minute.";
  if (span > 366 * 24 * 60 * 60 * 1000) return "Choose a window of 366 days or less.";
  return null;
}

export function windowKey(window: TimeWindow): string {
  if (window.type === "preset") return `preset:${window.preset}`;
  return `custom:${window.start.toISOString()}:${window.end.toISOString()}`;
}
