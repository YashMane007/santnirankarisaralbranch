/**
 * GET /api/data-version
 * Returns lightweight version timestamps from KV.
 * SW uses this to decide whether to refetch cached member data.
 */
import { type LoaderFunctionArgs, json } from "@remix-run/cloudflare";
import { getDataVersion } from "~/lib/kv.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const kv = (context.cloudflare.env as any).SEVADAL_CACHE as KVNamespace | undefined;
  const [members, locations, settings, news] = await Promise.all([
    getDataVersion(kv, "members"),
    getDataVersion(kv, "locations"),
    getDataVersion(kv, "settings"),
    getDataVersion(kv, "news"),
  ]);
  return json({ members, locations, settings, news }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
