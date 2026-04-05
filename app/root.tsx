import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/cloudflare";
import appCss from "~/styles/app.css?url";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous" as const,  // ✅ Literal type
  },
  { rel: "stylesheet", href: appCss },
  { rel: "manifest", href: "/manifest.json" },
  { rel: "icon", href: "/favicon.ico" },
  { rel: "apple-touch-icon", href: "/icon-192.png" },
];

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
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        {/* Register service worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
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
