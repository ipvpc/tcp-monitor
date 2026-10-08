import { useEffect, useState, type FormEvent } from "react";
import { createTarget, errorMessage, parseAddress, previewProbe, updateTarget } from "../api";
import { formatMs, kindLabel } from "../format";
import type { AddressPreview, ProbeResult, Target } from "../types";
import { Modal } from "./Modal";

const INTERVALS = [15, 30, 60, 300];

type Props = {
  target?: Target;
  onClose: () => void;
  onSaved: () => void;
};

export function TargetForm({ target, onClose, onSaved }: Props) {
  const [name, setName] = useState(target?.name ?? "");
  const [nameTouched, setNameTouched] = useState(Boolean(target));
  const [address, setAddress] = useState(target?.endpoint ?? "");
  const [intervalText, setIntervalText] = useState(String(target?.interval_seconds ?? 30));
  const [timeoutText, setTimeoutText] = useState(String(target?.timeout_ms ?? 5000));
  const [enabled, setEnabled] = useState(target?.enabled ?? true);
  const [preview, setPreview] = useState<AddressPreview | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const trimmed = address.trim();
    if (!trimmed) {
      setPreview(null);
      setAddressError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void parseAddress(trimmed).then(
        (next) => {
          if (cancelled) return;
          setPreview(next);
          setAddressError(null);
          if (!nameTouched) setName(suggestedName(next));
        },
        (error: unknown) => {
          if (cancelled) return;
          setPreview(null);
          setAddressError(errorMessage(error));
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, nameTouched]);

  async function onTest() {
    const timeoutMs = readNumber(timeoutText, 100, 60000);
    if (timeoutMs == null) {
      setFormError("Timeout must be between 100 and 60000 milliseconds.");
      return;
    }
    setBusy(true);
    setFormError(null);
    setProbe(null);
    try {
      setProbe(await previewProbe(address.trim(), timeoutMs));
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const intervalSeconds = readNumber(intervalText, 5, 86400);
    const timeoutMs = readNumber(timeoutText, 100, 60000);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (intervalSeconds == null) {
      setFormError("Check interval must be between 5 and 86400 seconds.");
      return;
    }
    if (timeoutMs == null) {
      setFormError("Timeout must be between 100 and 60000 milliseconds.");
      return;
    }
    const body = {
      name: name.trim(),
      address: address.trim(),
      interval_seconds: intervalSeconds,
      timeout_ms: timeoutMs,
      enabled,
    };
    setBusy(true);
    setFormError(null);
    try {
      if (target) await updateTarget(target.id, body);
      else await createTarget(body);
      onSaved();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Modal title={target ? "Edit target" : "Add target"} onClose={onClose}>
      <form className="stack" onSubmit={onSubmit}>
        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => {
              setNameTouched(true);
              setName(event.target.value);
            }}
            maxLength={120}
            required
          />
        </label>
        <label>
          <span>Address</span>
          <input
            value={address}
            onChange={(event) => {
              setProbe(null);
              setAddress(event.target.value);
            }}
            placeholder="db.internal:5432 or https://example.com/health"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <p className="hint">
          A host and port is checked with a TCP connection. An http(s) URL is checked by response time.
          Use host.docker.internal to reach a service on this computer.
        </p>
        {preview && (
          <p className="hint ok">
            {kindLabel(preview.kind)} · {preview.endpoint}
          </p>
        )}
        {addressError && <p className="hint bad">{addressError}</p>}
        <fieldset>
          <legend>Check every</legend>
          <div className="chips">
            {INTERVALS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                aria-pressed={intervalText === String(seconds)}
                onClick={() => setIntervalText(String(seconds))}
              >
                {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
              </button>
            ))}
          </div>
          <label>
            <span>Seconds</span>
            <input
              inputMode="numeric"
              value={intervalText}
              onChange={(event) => setIntervalText(event.target.value)}
            />
          </label>
        </fieldset>
        <label>
          <span>Timeout (ms)</span>
          <input
            inputMode="numeric"
            value={timeoutText}
            onChange={(event) => setTimeoutText(event.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>Enabled</span>
        </label>
        {probe && (
          <p className={probe.ok ? "hint ok" : "hint bad"} role="status">
            {probe.ok
              ? `Up in ${formatMs(probe.latency_ms)}`
              : `Down. ${probe.error ?? "Check failed."}`}
          </p>
        )}
        {formError && (
          <p className="hint bad" role="alert">
            {formError}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="ghost" onClick={() => void onTest()} disabled={busy || !address.trim()}>
            Test connection
          </button>
          <button type="submit" className="primary" disabled={busy || !address.trim() || Boolean(addressError)}>
            {busy ? "Working…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function suggestedName(preview: AddressPreview): string {
  const path = preview.path.split("?")[0] ?? "";
  if (preview.kind === "tcp" || path === "" || path === "/") return preview.host;
  return `${preview.host}${path}`.slice(0, 120);
}

function readNumber(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (parsed < min || parsed > max) return null;
  return parsed;
}
