import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { getSupabasePublicUrl, VIDEO_MIME_TYPES } from "@/lib/storage/supabase-file-storage";

// The video bytes themselves are uploaded directly from the browser to
// Supabase Storage beforehand (see the sibling /presign route) — Vercel
// Functions cap request bodies at ~4.5MB, far under what a real video needs,
// so this route only ever receives the resulting object keys as JSON.
const createPackageVideosSchema = z.object({
  videos: z
    .array(
      z.object({
        path: z.string().trim().min(1, "path is required"),
        mimeType: z.enum(VIDEO_MIME_TYPES),
      })
    )
    .min(1, "At least one video is required"),
});

// Adds one or more gallery videos to an existing package, independent of the
// cover image/single videoUrl link — lets the admin UI add videos to an
// already-created package without resubmitting the whole form.
export async function POST(request: Request, ctx: RouteContext<"/api/packages/[id]/videos">) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const { id } = await ctx.params;

    const pkg = await db.package.findUnique({ where: { id } });
    if (!pkg) return jsonError("Package not found", 404);

    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Invalid request body", 400);

    const { videos } = createPackageVideosSchema.parse(body);

    const maxOrder = await db.packageVideo.aggregate({
      where: { packageId: id },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? -1) + 1;

    const created = [];
    for (const video of videos) {
      const dbVideo = await db.packageVideo.create({
        data: { packageId: id, videoPath: video.path, order: nextOrder },
      });
      created.push({ ...dbVideo, url: getSupabasePublicUrl(dbVideo.videoPath) });
      nextOrder += 1;
    }

    return NextResponse.json({ videos: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
