import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { createSupabaseVideoUploadUrl, InvalidFileUploadError, VIDEO_MIME_TYPES } from "@/lib/storage/supabase-file-storage";

const presignSchema = z.object({ contentType: z.enum(VIDEO_MIME_TYPES) });

// Hands the browser a signed Supabase Storage upload URL so the video bytes
// go straight from the client to the bucket — never through this app's own
// API — avoiding Vercel Functions' ~4.5MB request body cap.
export async function POST(request: Request, ctx: RouteContext<"/api/packages/[id]/videos/presign">) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const { id } = await ctx.params;

    const pkg = await db.package.findUnique({ where: { id } });
    if (!pkg) return jsonError("Package not found", 404);

    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Invalid request body", 400);

    const { contentType } = presignSchema.parse(body);

    try {
      const upload = await createSupabaseVideoUploadUrl(contentType, "packages");
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
