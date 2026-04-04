// NEW COMPONENT - Custom install banner

import { useEffect, useState } from "react";

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Listen for install prompt
    window.addEventListener("beforeinstallprompt", (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Show after 3 seconds
      setTimeout(() => setShowPrompt(true), 4000);
    });
  }, []);

  const handleInstall = async () => {
    // if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setShowPrompt(false);
    // }
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    setShowPrompt(false);
  };

  return (
    <div style={{ /* Orange gradient banner at bottom */ }}>
      📲 Install Sevadal App
      <button onClick={handleInstall}>Install Now</button>
      <button onClick={handleDismiss}>✕</button>
    </div>
  );
}