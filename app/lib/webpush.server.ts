/**
 * Web Push (RFC 8291 aes128gcm + RFC 8030) — Cloudflare Workers edge runtime.
 * Uses only Web Crypto API. No Node.js dependencies.
 *
 * Supports VAPID private key in TWO formats:
 *   1. JWK JSON string  {"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}
 *   2. Raw base64url    (output of `npx web-push generate-vapid-keys`)
 *      → x/y are extracted from the matching public key automatically.
 */

// ─── Byte helpers ─────────────────────────────────────────────────────────────

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64u(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function uint32BE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, n, false);
  return buf;
}

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ─── HKDF ────────────────────────────────────────────────────────────────────

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info } as HkdfParams,
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

// ─── VAPID private key import (JWK JSON or raw base64url) ────────────────────

/**
 * Accepts two formats for the VAPID private key:
 *   • Full JWK JSON string (from our node generation script)
 *   • Raw base64url scalar (from `npx web-push generate-vapid-keys`)
 *
 * For raw format, x and y are reconstructed from the VAPID public key so we
 * can build a complete JWK — Web Crypto requires all three fields (d, x, y).
 */
async function importVapidPrivateKey(
  privateKeyStr: string,
  vapidPublicKeyB64u: string
): Promise<CryptoKey> {
  // ── Attempt 1: full JWK JSON ───────────────────────────────────────────────
  try {
    const jwk = JSON.parse(privateKeyStr) as JsonWebKey;
    if (jwk.kty === "EC" && jwk.d) {
      return await crypto.subtle.importKey(
        "jwk",
        { ...jwk, key_ops: ["sign"] },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
    }
  } catch { /* not JSON — fall through to raw format */ }

  // ── Attempt 2: raw base64url private key (npx web-push generate-vapid-keys) ─
  // VAPID public key is an uncompressed P-256 point: 0x04 | x(32 bytes) | y(32 bytes)
  // We extract x and y to reconstruct the complete JWK.
  const pubBytes = fromB64u(vapidPublicKeyB64u); // 65 bytes
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY is not a valid uncompressed P-256 point (must be 65 bytes starting with 0x04).");
  }
  const x = b64u(pubBytes.slice(1, 33));
  const y = b64u(pubBytes.slice(33, 65));

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateKeyStr,   // raw base64url scalar
    x,
    y,
    key_ops: ["sign"],
    ext: true,
  };

  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

// ─── VAPID JWT + Authorization header ────────────────────────────────────────

export async function createVapidAuth(
  endpoint: string,
  privateKeyStr: string,
  publicKeyB64u: string,
  subject: string
): Promise<string> {
  const audience  = new URL(endpoint).origin;
  const header    = { alg: "ES256", typ: "JWT" };
  const jwtPayload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };

  const encH = b64u(textBytes(JSON.stringify(header)));
  const encP = b64u(textBytes(JSON.stringify(jwtPayload)));
  const sigInput = `${encH}.${encP}`;

  const privateKey = await importVapidPrivateKey(privateKeyStr, publicKeyB64u);

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    textBytes(sigInput)
  );

  return `vapid t=${sigInput}.${b64u(sig)},k=${publicKeyB64u}`;
}

// ─── RFC 8291 aes128gcm message encryption ───────────────────────────────────

export async function encryptPushPayload(
  plaintext: string,
  p256dhB64u: string,   // subscription public key (65-byte uncompressed P-256)
  authB64u: string      // subscription auth secret (16 bytes)
): Promise<{ body: Uint8Array; salt: Uint8Array; senderPublicKey: Uint8Array }> {
  const recipientPublicKey = fromB64u(p256dhB64u);
  const authSecret = fromB64u(authB64u);

  // Ephemeral sender key pair for this message
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  ) as CryptoKeyPair; // cast: generateKey overloads don't narrow to CryptoKeyPair without it

  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeyPair.publicKey) as ArrayBuffer
  ); // exportKey("raw") returns ArrayBuffer, but overload types include JsonWebKey

  // Import recipient key for ECDH
  const recipientCryptoKey = await crypto.subtle.importKey(
    "raw",
    recipientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH → 32-byte shared secret
  const ecdhSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientCryptoKey } as EcdhKeyDeriveParams,
    senderKeyPair.privateKey,
    256
  );
  const ecdhSecret = new Uint8Array(ecdhSecretBits);

  // HKDF IKM per RFC 8291 §3.3
  const ikmInfo = concat(
    textBytes("WebPush: info\0"),
    recipientPublicKey,
    senderPublicKeyRaw
  );
  const ikm = await hkdf(ecdhSecret, authSecret, ikmInfo, 32);

  // Content salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK and nonce
  const cek   = await hkdf(ikm, salt, textBytes("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, textBytes("Content-Encoding: nonce\0"), 12);

  // Pad plaintext + 0x02 record delimiter
  const padded = concat(textBytes(plaintext), new Uint8Array([2]));

  // AES-128-GCM encrypt
  const cekKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded)
  );

  // aes128gcm content-encoding header: salt(16) + rs(4) + idlen(1) + sender_pub(65)
  const header = concat(
    salt,
    uint32BE(4096),
    new Uint8Array([65]),
    senderPublicKeyRaw
  );

  return { body: concat(header, ciphertext), salt, senderPublicKey: senderPublicKeyRaw };
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

export interface PushSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

// ─── Send one push notification ───────────────────────────────────────────────

export async function sendPushNotification(
  sub: PushSubscription,
  payload: PushPayload,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  vapidSubject: string
): Promise<PushSendResult> {
  try {
    const json = JSON.stringify(payload);
    const { body } = await encryptPushPayload(json, sub.p256dh, sub.auth);
    const authHeader = await createVapidAuth(sub.endpoint, vapidPrivateKey, vapidPublicKey, vapidSubject);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Authorization":    authHeader,
        "Content-Type":     "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL":              "86400",
      },
      body,
    });

    if (res.status === 201 || res.status === 200 || res.status === 204) {
      return { ok: true, status: res.status };
    }

    const errText = await res.text().catch(() => "(could not read response body)");
    return { ok: false, status: res.status, error: errText };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
