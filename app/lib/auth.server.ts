/**
 * PIN authentication using PBKDF2 via WebCrypto API.
 * Works natively in Cloudflare Workers — no bcrypt or Node.js needed.
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 256; // bits
const HASH_ALGO = "SHA-256";

/** Blocked weak PINs */
const WEAK_PINS = new Set([
  "0000","1111","2222","3333","4444","5555","6666","7777","8888","9999",
  "1234","4321","1122","2211","0101","1010","0000","1212","2121","1230",
  "0987","9876","2345","3456","4567","5678","6789","7890",
]);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin) && !isWeakPin(pin);
}

/** Generate a random 16-byte hex salt */
export async function generateSalt(): Promise<string> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash a PIN with PBKDF2 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    KEY_LENGTH
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison to prevent timing attacks */
async function safeCompare(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aKey = await crypto.subtle.importKey("raw", encoder.encode(a), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bKey = await crypto.subtle.importKey("raw", encoder.encode(b), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const msg = encoder.encode("compare");
  const [aSig, bSig] = await Promise.all([
    crypto.subtle.sign("HMAC", aKey, msg),
    crypto.subtle.sign("HMAC", bKey, msg),
  ]);
  const aArr = new Uint8Array(aSig);
  const bArr = new Uint8Array(bSig);
  let diff = 0;
  for (let i = 0; i < aArr.length; i++) diff |= aArr[i] ^ bArr[i];
  return diff === 0;
}

/** Verify a PIN against a stored hash */
export async function verifyPin(
  pin: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const hash = await hashPin(pin, salt);
  return safeCompare(hash, storedHash);
}
