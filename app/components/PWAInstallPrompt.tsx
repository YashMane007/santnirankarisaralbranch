import { useEffect, useState } from "react";

/**
 * PWA Install Prompt — works on Android AND iOS.
 *
 * WHY the old one was broken:
 *   `beforeinstallprompt` fires during page load, BEFORE React hydrates.
 *   By the time useEffect adds the listener, the event is already gone.
 *   Fix: root.tsx captures it early into window.__pwaPrompt via an inline
 *   <script> in <head>. This component just reads it from there.
 *
 * iOS Safari never fires beforeinstallprompt at all.
 *   Fix: detect iOS and show manual "Share → Add to Home Screen" instructions.
 */

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isAlreadyInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

const DISMISS_KEY = "pwa-install-dismissed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function PWAInstallPrompt() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);

  useEffect(() => {
    // Already installed as PWA — never show
    if (isAlreadyInstalled()) return;

    // Cooldown check
    try {
      const ts = localStorage.getItem(DISMISS_KEY);
      if (ts && Date.now() - parseInt(ts) < COOLDOWN_MS) return;
    } catch { /* private browsing */ }

    if (isIOS()) {
      setMode("ios");
    } else {
      // Android/Chrome: event was captured early by root.tsx inline script
      if ((window as any).__pwaPrompt) setMode("android");
    }
  }, []);

  const handleInstall = async () => {
    const prompt = (window as any).__pwaPrompt;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    (window as any).__pwaPrompt = null;
    setMode(null);
    if (outcome === "dismissed") {
      try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch { /**/ }
    }
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch { /**/ }
    setMode(null);
  };

  if (mode === "android") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        marginTop: "12px", padding: "10px 14px",
        background: "rgba(249,115,22,0.10)",
        border: "1px solid rgba(249,115,22,0.25)",
        borderRadius: "10px", fontSize: "13px",
      }}>
        <span style={{ fontSize: "20px", flexShrink: 0 }}>📲</span>
        <span style={{ flex: 1, fontWeight: 500, color: "var(--saffron-700)", textAlign: "left" }}>
          Install Sevadal App
        </span>
        <button type="button" onClick={handleInstall} style={{
          background: "var(--saffron-600)", color: "white", border: "none",
          borderRadius: "6px", padding: "5px 12px", fontSize: "12px",
          fontWeight: 600, cursor: "pointer", flexShrink: 0,
        }}>
          Install
        </button>
        <button type="button" onClick={handleDismiss} aria-label="Dismiss" style={{
          background: "none", border: "none", color: "var(--gray-400)",
          cursor: "pointer", fontSize: "16px", lineHeight: 1,
          padding: "2px 4px", flexShrink: 0,
        }}>
          ✕
        </button>
      </div>
    );
  }

  if (mode === "ios") {
    return (
      <div style={{
        marginTop: "12px", padding: "12px 14px",
        background: "rgba(249,115,22,0.10)",
        border: "1px solid rgba(249,115,22,0.25)",
        borderRadius: "10px", fontSize: "13px",
        position: "relative",
      }}>
        <button type="button" onClick={handleDismiss} aria-label="Dismiss" style={{
          position: "absolute", top: "8px", right: "10px",
          background: "none", border: "none", color: "var(--gray-400)",
          cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "2px 4px",
        }}>✕</button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span style={{ fontSize: "18px" }}>📲</span>
          <span style={{ fontWeight: 600, color: "var(--saffron-700)" }}>Install Sevadal App</span>
        </div>
        <div style={{ color: "var(--gray-600)", lineHeight: "1.7", fontSize: "12px" }}>
          Tap the <strong>Share</strong> button{" "}
          <span style={{ display: "inline-block", fontSize: "15px", verticalAlign: "middle" }}>⎙</span>
          {" "}at the bottom of Safari,<br />
          then tap <strong>"Add to Home Screen"</strong>.
        </div>
      </div>
    );
  }

  return null;
}
