declare const caches: CacheStorage;
import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";
import * as build from "../build/server";

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext: (context) => ({
    cloudflare: {
      env: context.env,
      cf: context.request.cf,
      ctx: {
        waitUntil: context.waitUntil.bind(context),
        passThroughOnException: context.passThroughOnException.bind(context),
      },
      caches: caches as CacheStorage,
    },
  }),
});