import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
  useLoaderData,
} from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import appCss from "~/styles/app.css?url";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous" as const,
  },
  { rel: "stylesheet", href: appCss },
  { rel: "manifest", href: "/manifest.json" },
  { rel: "icon", href: "/favicon.ico" },
  { rel: "apple-touch-icon", href: "/icon-192.png" },
];


export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as any;
  return json({ vapidPublicKey: (env.VAPID_PUBLIC_KEY as string) ?? "" });
}


function VapidKeyScript() {
  let key = "";
  try { key = (useLoaderData<any>() as any)?.vapidPublicKey ?? ""; } catch {}
  if (!key) return null;
  return <script dangerouslySetInnerHTML={{ __html: `window.__VAPID_PUBLIC_KEY__=${JSON.stringify(key)};` }} />;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f97316" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Sevadal" />
        <Meta />
        <Links />
        {/*
          Capture beforeinstallprompt BEFORE React hydrates.
          The event fires early on page load — if we wait for useEffect it's already gone.
          Stored on window.__pwaPrompt so PWAInstallPrompt component can read it.
        */}
        <script dangerouslySetInnerHTML={{ __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaPrompt=e;});` }} />
        <VapidKeyScript />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        {/* Register service worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // ── Push subscription setup ─────────────────────────────────────────
      // NOTE: Notification.requestPermission() is NOT called here.
      // dashboard.tsx requests it alongside the GPS permission so both
      // dialogs appear together (user-gesture context). Here we only
      // re-subscribe on subsequent page loads when permission is already granted.
      if (!('PushManager' in window)) return;
      if (!('__VAPID_PUBLIC_KEY__' in window)) return;

      const vapidKey = window.__VAPID_PUBLIC_KEY__;
      if (!vapidKey) return;

      // Only proceed if user has already granted notification permission
      if (Notification.permission !== 'granted') return;

      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        try {
          const key = Uint8Array.from(atob(vapidKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        } catch(e) { console.warn('Push subscribe failed', e); return; }
      }

      // Send subscription to server
      const p256dh = btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
      const auth   = btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
      fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ action:'subscribe', endpoint: sub.endpoint, p256dh, auth }),
      }).catch(() => {});
    } catch(e) { console.warn('SW/Push setup error', e); }
  });
})();
            `,
          }}
        />
      </body>
    </html>
  );
}

/**
 * Top-of-page navigation progress bar.
 * Shown whenever Remix is loading a new route (between Link click and page render).
 * This eliminates the "white flash / line" visible between dashboard ↔ news ↔ profile.
 */
function NavProgressBar() {
  const nav = useNavigation();
  const loading = nav.state === "loading";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "3px",
        zIndex: 9999,
        pointerEvents: "none",
        // Only visible while loading; smooth fade-out on done
        opacity: loading ? 1 : 0,
        transition: loading ? "none" : "opacity 0.4s ease 0.1s",
      }}
    >
      <div
        style={{
          height: "100%",
          background: "linear-gradient(90deg, #f97316, #fb923c)",
          // Animate from 0% to ~85% while loading, then snap to 100% when done
          width: loading ? "85%" : "100%",
          transition: loading
            ? "width 2.5s cubic-bezier(0.1, 0.4, 0.3, 1)"
            : "width 0.15s ease",
          borderRadius: "0 2px 2px 0",
          boxShadow: "0 0 8px rgba(249,115,22,0.5)",
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <>
      <NavProgressBar />
      <Outlet />
    </>
  );
}

export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100dvh",
            fontFamily: "sans-serif",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px" }}>⚠️</div>
          <h1 style={{ fontWeight: "700", fontSize: "20px" }}>Something went wrong</h1>
          <p style={{ color: "#78716c", fontSize: "14px" }}>
            Please try refreshing the page.
          </p>
          <a
            href="/"
            style={{
              background: "#f97316",
              color: "white",
              padding: "10px 24px",
              borderRadius: "9999px",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            Go Home
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
