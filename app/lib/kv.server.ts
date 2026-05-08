/**
 * KV caching helpers — wraps D1 queries with SEVADAL_CACHE KV.
 * Falls back gracefully if KV not bound.
 */

type KV = KVNamespace | undefined;

async function kvGet<T>(kv: KV, key: string): Promise<T | null> {
  if (!kv) return null;
  try {
    const val = await kv.get(key, "json");
    return val as T | null;
  } catch { return null; }
}

async function kvSet(kv: KV, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch {}
}

export async function kvDel(kv: KV, ...keys: string[]): Promise<void> {
  if (!kv) return;
  for (const k of keys) {
    try { await kv.delete(k); } catch {}
  }
}

// ─── Cached DB calls ──────────────────────────────────────────────────────────

export async function cachedListLocations(kv: KV, db: D1Database, activeOnly: boolean): Promise<any[]> {
  const key = `locations:${activeOnly ? "active" : "all"}`;
  const cached = await kvGet<any[]>(kv, key);
  if (cached) return cached;
  const { listLocations } = await import("~/lib/db.server");
  const result = await listLocations(db, activeOnly);
  await kvSet(kv, key, result, 300); // 5 min TTL
  return result;
}

export async function cachedGetAppSettings(kv: KV, db: D1Database): Promise<any> {
  const key = "settings:app";
  const cached = await kvGet<any>(kv, key);
  if (cached) return cached;
  const { getAppSettings } = await import("~/lib/appsettings.server");
  const result = await getAppSettings(db);
  await kvSet(kv, key, result, 120); // 2 min TTL
  return result;
}

export function invalidateLocations(kv: KV): Promise<void> {
  return kvDel(kv, "locations:active", "locations:all");
}

export function invalidateSettings(kv: KV): Promise<void> {
  return kvDel(kv, "settings:app");
}

// ─── Data version (for SW offline sync) ─────────────────────────────────────

export async function bumpDataVersion(kv: KV, scope: string): Promise<void> {
  if (!kv) return;
  const v = Date.now().toString();
  await kvSet(kv, `version:${scope}`, v, 0); // no TTL — persist
}

export async function getDataVersion(kv: KV, scope: string): Promise<string> {
  if (!kv) return "0";
  const v = await kvGet<string>(kv, `version:${scope}`);
  return v ?? "0";
}
