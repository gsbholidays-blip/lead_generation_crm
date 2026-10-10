import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { listGalleryVideos, nextGalleryVideoOrder } from "@/lib/queries/gallery-videos";
import { getSupabasePublicUrl } from "@/lib/storage/supabase-file-storage";
import { createGalleryVideoSchema } from "@/lib/validations/gallery-videos";

export async function GET() {
  try {
    await requireRole("ADMIN", "MANAGER");
    const videos = await listGalleryVideos();
    return NextResponse.json({
      videos: videos.map((video) => ({ ...video, url: getSupabasePublicUrl(video.videoPath) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// The actual video bytes are uploaded directly from the browser to Supabase
// Storage beforehand (see /api/gallery-videos/presign) — Vercel Functions cap
// request bodies at ~4.5MB, far under what a real video needs, so this route
// only ever receives the resulting object key as JSON, never the file itself.
export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Invalid request body", 400);

    const input = createGalleryVideoSchema.parse(body);
    const order = input.order ?? (await nextGalleryVideoOrder());

    const galleryVideo = await db.galleryVideo.create({
      data: {
        videoPath: input.path,
        caption: input.caption,
        order,
      },
    });

    return NextResponse.json(
      { video: { ...galleryVideo, url: getSupabasePublicUrl(galleryVideo.videoPath) } },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
