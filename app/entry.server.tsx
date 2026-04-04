import type { AppLoadContext, EntryContext } from "@remix-run/cloudflare";
import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

const ABORT_DELAY = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext
) {
  const userAgent = request.headers.get("user-agent");
  const body = await renderToReadableStream(
    <RemixServer context={remixContext} url={request.url} abortDelay={ABORT_DELAY} />,
    {
      signal: AbortSignal.timeout(ABORT_DELAY),
      onError(error: unknown) {
        console.error(error);
        responseStatusCode = 500;
      },
    }
  );

  if (isbot(userAgent ?? "")) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
