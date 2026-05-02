import { useEffect, useState } from "react";

interface ToastProps {
  message: string | null | undefined;
  type?: "success" | "error" | "warning";
  duration?: number;
}

/**
 * Floating toast notification that auto-dismisses.
 * Shows every time `message` changes (resets timer on new message).
 */
export function Toast({ message, type = "error", duration = 4000 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(t);
  }, [message, duration]);

  if (!visible || !message) return null;

  const bg = type === "success" ? "var(--success)" : type === "warning" ? "#d97706" : "var(--error)";
  const icon = type === "success" ? "✅" : type === "warning" ? "⚡" : "⚠️";

  return (
    <div
      role="alert"
      style={{
        position: "fixed", bottom: "24px", right: "24px",
        padding: "12px 16px",
        borderRadius: "10px",
        background: bg,
        color: "white",
        fontSize: "13px",
        fontWeight: 500,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        zIndex: 10000,
        display: "flex", alignItems: "flex-start", gap: "8px",
        maxWidth: "340px",
        animation: "toastSlideIn 0.25s ease",
      }}
    >
      <span style={{ flexShrink: 0, marginTop: "1px" }}>{icon}</span>
      <span style={{ flex: 1, lineHeight: "1.5" }}>{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        style={{
          background: "none", border: "none",
          color: "rgba(255,255,255,0.8)",
          cursor: "pointer", fontSize: "16px",
          padding: "0 2px", flexShrink: 0,
          lineHeight: 1,
        }}
      >✕</button>
    </div>
  );
}
