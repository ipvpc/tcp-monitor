import { Modal } from "./Modal";

type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({ title, body, confirmLabel, busy, error, onConfirm, onClose }: Props) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <p>{body}</p>
        {error && (
          <p className="hint bad" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Removing…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
