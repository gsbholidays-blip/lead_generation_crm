"use client";

export type SignedVideoUpload = {
  signedUrl: string;
  path: string;
  token: string;
  mimeType: string;
};

/**
 * Asks one of this app's presign routes (e.g. /api/gallery-videos/presign)
 * for a signed Supabase Storage upload target for a video of the given type.
 */
export async function requestSignedVideoUpload(
  presignUrl: string,
  contentType: string
): Promise<SignedVideoUpload> {
  const res = await fetch(presignUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to prepare video upload");
  }
  return res.json();
}

/**
 * Uploads a video file straight to Supabase Storage using a signed upload
 * URL — this never touches this app's own API, which is the whole point:
 * Vercel Functions cap request bodies at ~4.5MB, far under what a real video
 * needs. The token embedded in the signed URL is sufficient authorization on
 * its own (Supabase signed upload URLs work "without further
 * authentication"), so no Supabase API key is needed or sent from the
 * browser here.
 */
export function uploadVideoToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Video upload failed (status ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Video upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}
