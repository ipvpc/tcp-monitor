import { useEffect, useState, type FormEvent } from "react";
import { formatStamp, toLocalInput } from "../format";
import { PRESETS, customSearch, windowError, windowKey, type PresetId, type TimeWindow } from "../range";

type Props = {
  path: string;
  timeWindow: TimeWindow;
  start: Date;
  end: Date;
  onNavigate: (to: string, mode?: "push" | "replace") => void;
};

export function TimeRangeBar({ path, timeWindow, start, end, onNavigate }: Props) {
  const [customOpen, setCustomOpen] = useState(timeWindow.type === "custom");
  const [draftStart, setDraftStart] = useState(toLocalInput(start));
  const [draftEnd, setDraftEnd] = useState(toLocalInput(end));
  const [message, setMessage] = useState<string | null>(null);
  const key = windowKey(timeWindow);

  useEffect(() => {
    if (timeWindow.type !== "custom") return;
    setCustomOpen(true);
    setDraftStart(toLocalInput(timeWindow.start));
    setDraftEnd(toLocalInput(timeWindow.end));
    setMessage(null);
  }, [key, timeWindow]);

  function applyPreset(preset: PresetId) {
    setMessage(null);
    setCustomOpen(false);
    onNavigate(`${path}?preset=${preset}`, "replace");
  }

  function applyCustom(event: FormEvent) {
    event.preventDefault();
    const nextStart = new Date(draftStart);
    const nextEnd = new Date(draftEnd);
    const problem = windowError(nextStart, nextEnd);
    if (problem) {
      setMessage(problem);
      return;
    }
    setMessage(null);
    onNavigate(`${path}?${customSearch(nextStart, nextEnd)}`, "push");
  }

  const presetLabel =
    timeWindow.type === "preset"
      ? (PRESETS.find((preset) => preset.id === timeWindow.preset)?.label ?? "1h")
      : "Custom";

  return (
    <div className="range">
      <div className="presets" role="group" aria-label="History window">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={timeWindow.type === "preset" && timeWindow.preset === preset.id}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={timeWindow.type === "custom" || customOpen}
          onClick={() => {
            setCustomOpen(true);
            setDraftStart(toLocalInput(start));
            setDraftEnd(toLocalInput(end));
          }}
        >
          Custom
        </button>
      </div>
      {customOpen && (
        <form className="custom-range" onSubmit={applyCustom}>
          <label>
            <span>From</span>
            <input
              type="datetime-local"
              value={draftStart}
              onChange={(event) => setDraftStart(event.target.value)}
              required
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="datetime-local"
              value={draftEnd}
              onChange={(event) => setDraftEnd(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary">
            Apply
          </button>
        </form>
      )}
      <p className="range-label">
        {presetLabel} · {formatStamp(start)} to {formatStamp(end)}
      </p>
      {message && (
        <p className="hint bad" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
