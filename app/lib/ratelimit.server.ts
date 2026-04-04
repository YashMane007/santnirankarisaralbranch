/**
 * Rate limiting backed by D1.
 * Uses a sliding-window approach per key.
 * Keys are namespaced: e.g. "login:ip:1.2.3.4" or "attend:member:SNM001"
 */

export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = Date.now();
  const windowStart = new Date(now - windowSeconds * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  // Get current record
  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: string }>();

  const resetAt = new Date(now + windowSeconds * 1000);

  if (!row || row.window_start < windowStart) {
    // New window — reset counter to 1
    await db
      .prepare(
        "INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)"
      )
      .bind(key, nowIso)
      .run();
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (row.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  // Increment
  await db
    .prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?")
    .bind(key)
    .run();

  return {
    allowed: true,
    remaining: maxRequests - row.count - 1,
    resetAt,
  };
}

/** Periodically clean up old rate limit entries (call from a scheduled worker or lazily) */
export async function cleanRateLimits(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare("DELETE FROM rate_limits WHERE window_start < ?")
    .bind(cutoff)
    .run();
}
