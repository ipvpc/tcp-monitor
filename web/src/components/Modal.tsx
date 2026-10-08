import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog ref={ref} className="modal" aria-labelledby="dialog-title">
      <div className="modal-panel">
        <header className="modal-head">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="ghost" onClick={() => onCloseRef.current()}>
            Close
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
