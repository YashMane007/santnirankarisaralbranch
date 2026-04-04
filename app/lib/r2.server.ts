/**
 * R2 bucket operations for profile photos.
 * All uploads go through the server — never directly from the browser.
 */

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface UploadResult {
  key: string;
  error?: never;
}
export interface UploadError {
  key?: never;
  error: string;
}

/** Validate and upload a profile photo to R2. Returns the storage key. */
export async function uploadProfilePhoto(
  bucket: R2Bucket,
  memberId: string,
  file: File
): Promise<UploadResult | UploadError> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Only JPEG, PNG, or WebP images are allowed." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: "Image must be smaller than 2 MB." };
  }

  const ext = file.type === "image/jpeg" ? "jpg"
    : file.type === "image/png" ? "png"
    : "webp";

  const key = `photos/${memberId}.${ext}`;
  const bytes = await file.arrayBuffer();

  await bucket.put(key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  return { key };
}

/** Delete a profile photo from R2 */
export async function deleteProfilePhoto(
  bucket: R2Bucket,
  key: string
): Promise<void> {
  await bucket.delete(key);
}

/** Get a photo from R2 and return as a Response (used by api.photo.$ route) */
export async function getPhotoResponse(
  bucket: R2Bucket,
  key: string
): Promise<Response> {
  const obj = await bucket.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=86400, immutable");
  headers.set("ETag", obj.etag);
  return new Response(obj.body, { headers });
}
