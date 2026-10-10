import "server-only";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

// Public marketing images (Packages/Gallery) — and, as of the Vercel
// migration, Booking attachments too — live in a Supabase Storage bucket
// rather than local disk, since Vercel Functions have a read-only, ephemeral
// filesystem that can't durably store an upload. Package/Gallery objects are
// served publicly via getSupabasePublicUrl; Booking attachments (private
// guest documents) stay behind this app's own auth-gated
// /api/files/[...path] route via readSupabaseFile instead.
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET!;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Booking attachments (payment screenshots / ID proofs) need the same image
// types plus PDF — kept as a separate map from ALLOWED_TYPES so package/
// gallery image uploads can't accidentally start accepting PDFs.
const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// NOTE: this cap is only enforced on the legacy path below, where the video's
// bytes flow through this app's own API route (saveSupabaseVideo). Vercel
// Functions actually cap request bodies at ~4.5MB, far under this number —
// real videos must go through createSupabaseVideoUploadUrl's direct-to-bucket
// signed upload instead, which never touches this app's server at all.
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

export class InvalidFileUploadError extends Error {}
export class SupabaseFileNotFoundError extends Error {}

/** Generic Supabase Storage image upload — pass a `subdir` per feature (e.g. "packages", "gallery"). */
export async function saveSupabaseFile(file: File, subdir: string) {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw new InvalidFileUploadError("File must be a JPEG, PNG, or WebP image");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new InvalidFileUploadError("File must be under 10MB");
  }

  const key = `${subdir}/${nanoid(16)}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
  });
  if (error) throw error;

  return { path: key, mimeType: file.type };
}

/**
 * Document-upload counterpart of saveSupabaseFile — same bucket/pattern, but
 * also allows PDF, for Booking attachments (payment screenshots / ID
 * proofs). Those used to live on local disk (see git history of
 * local-file-storage.ts) until Vercel's read-only serverless filesystem made
 * that throw on every write; they're served back out through the
 * auth-gated /api/files/[...path] route via readSupabaseFile below rather
 * than getSupabasePublicUrl, so moving them into this shared bucket doesn't
 * expose them at a public URL anywhere in the app.
 */
export async function saveSupabaseDocument(file: File, subdir: string) {
  const extension = ALLOWED_DOCUMENT_TYPES[file.type];
  if (!extension) {
    throw new InvalidFileUploadError("File must be a JPEG, PNG, WebP image, or PDF");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new InvalidFileUploadError("File must be under 10MB");
  }

  const key = `${subdir}/${nanoid(16)}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
  });
  if (error) throw error;

  return { path: key, mimeType: file.type };
}

/**
 * Video upload counterpart of saveSupabaseFile. Videos are still stored in
 * the same public bucket, but callers should serve them via
 * getSupabasePublicUrl rather than the /api/public/files proxy — that route
 * has no HTTP Range support, which video playback needs for seeking.
 */
export async function saveSupabaseVideo(file: File, subdir: string) {
  const extension = ALLOWED_VIDEO_TYPES[file.type];
  if (!extension) {
    throw new InvalidFileUploadError("File must be an MP4, WebM, or MOV video");
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    throw new InvalidFileUploadError("File must be under 100MB");
  }

  const key = `${subdir}/${nanoid(16)}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
  });
  if (error) throw error;

  return { path: key, mimeType: file.type };
}

/**
 * Generates a signed upload target for a video so the browser can PUT the
 * bytes straight to Supabase Storage, bypassing this app's own API route
 * entirely (and therefore Vercel's ~4.5MB serverless function body limit,
 * which otherwise rejects any real video before saveSupabaseVideo's own
 * 100MB check ever runs). The returned token is itself sufficient
 * authorization for the upload — callers hand it to the browser as-is, no
 * Supabase API key required.
 */
export async function createSupabaseVideoUploadUrl(contentType: string, subdir: string) {
  const extension = ALLOWED_VIDEO_TYPES[contentType];
  if (!extension) {
    throw new InvalidFileUploadError("File must be an MP4, WebM, or MOV video");
  }

  const key = `${subdir}/${nanoid(16)}.${extension}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(key);
  if (error) throw error;

  return { signedUrl: data.signedUrl, path: data.path, token: data.token, mimeType: contentType };
}

/** Public URL for an object in the (public) Supabase bucket — safe to call for any key already stored there. */
export function getSupabasePublicUrl(key: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

export async function readSupabaseFile(key: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) {
    if (error.message.toLowerCase().includes("not found")) {
      throw new SupabaseFileNotFoundError(key);
    }
    throw error;
  }

  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type || undefined };
}

/** Best-effort delete — a missing object should never block the DB operation that triggered it. */
export async function deleteSupabaseFile(key: string | null | undefined) {
  if (!key) return;
  try {
    await supabase.storage.from(BUCKET).remove([key]);
  } catch {
    // ignore
  }
}
