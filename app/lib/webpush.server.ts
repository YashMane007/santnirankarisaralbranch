/**
 * Web Push (RFC 8291 aes128gcm + RFC 8030) implementation
 * Uses only Web Crypto API — compatible with Cloudflare Workers edge runtime.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

// ─── VAPID JWT ────────────────────────────────────────────────────────────────

export async function createVapidAuth(
  endpoint: string,
  privateKeyJwkStr: string,
  publicKeyB64u: string,
  subject: string
): Promise<string> {
  const privateKeyJwk = JSON.parse(privateKeyJwkStr) as JsonWebKey;
  const audience = new URL(endpoint).origin;

  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };

  const encH = b64u(textBytes(JSON.stringify(header)));
  const encP = b64u(textBytes(JSON.stringify(payload)));
  const sigInput = `${encH}.${encP}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    textBytes(sigInput)
  );

  const jwt = `${sigInput}.${b64u(sig)}`;
  return `vapid t=${jwt},k=${publicKeyB64u}`;
}

// ─── Message Encryption (RFC 8291 aes128gcm) ─────────────────────────────────

export async function encryptPushPayload(
  plaintext: string,
  p256dhB64u: string, // subscription public key
  authB64u: string    // subscription auth secret
): Promise<{ body: Uint8Array; salt: Uint8Array; senderPublicKey: Uint8Array }> {
  const recipientPublicKey = fromB64u(p256dhB64u); // 65-byte uncompressed P-256
  const authSecret = fromB64u(authB64u);           // 16-byte auth secret

  // Generate ephemeral sender key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeyPair.publicKey)
  ); // 65 bytes

  // Import recipient public key for ECDH
  const recipientCryptoKey = await crypto.subtle.importKey(
    "raw",
    recipientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret (32 bytes)
  const ecdhSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientCryptoKey },
    senderKeyPair.privateKey,
    256
  );
  const ecdhSecret = new Uint8Array(ecdhSecretBits);

  // Derive IKM: HKDF(IKM=ecdh_secret, salt=auth_secret, info="WebPush: info\0" + recv_pub + send_pub, L=32)
  const ikmInfo = concat(
    textBytes("WebPush: info\0"),
    recipientPublicKey,
    senderPublicKeyRaw
  );
  const ikm = await hkdf(ecdhSecret, authSecret, ikmInfo, 32);

  // Generate content salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive CEK and nonce
  const cek   = await hkdf(ikm, salt, textBytes("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, textBytes("Content-Encoding: nonce\0"), 12);

  // Pad: plaintext + 0x02 delimiter (single record, no padding)
  const plaintextBytes = textBytes(plaintext);
  const padded = concat(plaintextBytes, new Uint8Array([2]));

  // Encrypt AES-128-GCM
  const cekKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded)
  );

  // Build header: salt(16) + record_size(4) + key_id_len(1) + sender_pub(65) = 86 bytes
  const header = concat(
    salt,
    uint32BE(4096),           // record size
    new Uint8Array([65]),     // key_id length
    senderPublicKeyRaw        // key_id = sender public key
  );

  return {
    body: concat(header, ciphertext),
    salt,
    senderPublicKey: senderPublicKeyRaw,
  };
}

// ─── Send Push Notification ───────────────────────────────────────────────────

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

export async function sendPushNotification(
  sub: PushSubscription,
  payload: PushPayload,
  vapidPrivateKeyJwk: string,
  vapidPublicKey: string,
  vapidSubject: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const json = JSON.stringify(payload);
    const { body } = await encryptPushPayload(json, sub.p256dh, sub.auth);
    const authHeader = await createVapidAuth(sub.endpoint, vapidPrivateKeyJwk, vapidPublicKey, vapidSubject);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
      },
      body,
    });

    if (res.status === 201 || res.status === 200 || res.status === 204) {
      return { ok: true, status: res.status };
    }
    // 410 = subscription gone (expired/revoked) — caller should delete
    return { ok: false, status: res.status, error: await res.text() };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown" };
  }
}
