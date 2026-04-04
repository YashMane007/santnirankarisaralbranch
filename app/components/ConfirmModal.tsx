/**
 * Custom styled confirm modal — replaces ugly browser window.confirm().
 * Usage:
 *   const { confirm, ConfirmModal } = useConfirm();
 *   await confirm("Are you sure?", { title: "Delete Member", danger: true })
 *     ? doAction() : doNothing();
 */
import { useState, useCallback, useRef } from "react";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  message: string;
  options: ConfirmOptions;
  resolve: ((v: boolean) => void) | null;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    message: "",
    options: {},
    resolve: null,
  });

  const confirm = useCallback((message: string, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, message, options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    state.resolve?.(true);
    setState(s => ({ ...s, open: false, resolve: null }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState(s => ({ ...s, open: false, resolve: null }));
  };

  const ConfirmDialog = state.open ? (
    <div
      className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) handleCancel(); }}
      style={{ zIndex: 9999 }}
    >
      <div className="modal-box" style={{ maxWidth: "380px" }}>
        <div className="modal-header">
          <h3 style={{ color: state.options.danger ? "var(--error)" : undefined }}>
            {state.options.title ?? "Confirm"}
          </h3>
          <button className="modal-close" type="button" onClick={handleCancel} title="Cancel">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--gray-700)" }}>
            {state.message}
          </p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={handleCancel}
          >
            {state.options.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`btn btn-md ${state.options.danger ? "btn-danger" : "btn-primary"}`}
            onClick={handleConfirm}
            autoFocus
          >
            {state.options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}
