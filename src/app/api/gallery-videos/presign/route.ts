import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { createSupabaseVideoUploadUrl, InvalidFileUploadError } from "@/lib/storage/supabase-file-storage";
import { presignGalleryVideoSchema } from "@/lib/validations/gallery-videos";

// Hands the browser a signed Supabase Storage upload URL so the video bytes
// go straight from the client to the bucket — never through this app's own
// API — avoiding Vercel Functions' ~4.5MB request body cap.
export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Invalid request body", 400);

    const { contentType } = presignGalleryVideoSchema.parse(body);

    try {
      const upload = await createSupabaseVideoUploadUrl(contentType, "gallery");
      return NextResponse.json(upload);
    } catch (error) {
      if (error instanceof InvalidFileUploadError) {
        return jsonError(error.message, 400);
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
