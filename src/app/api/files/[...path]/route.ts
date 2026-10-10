import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { readSupabaseFile, SupabaseFileNotFoundError } from "@/lib/storage/supabase-file-storage";

// Auth-gated, unlike Vercel Blob's public avatar URLs — these are private
// guest documents (payment screenshots / ID proofs). Downloaded server-side
// via the service-role Supabase client rather than a public bucket URL, so
// the access gate stays in this route regardless of where the bytes live.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/[...path]">) {
  try {
    await requireUser();
    const { path: segments } = await ctx.params;
    const relativePath = segments.join("/");
    const { buffer, contentType } = await readSupabaseFile(relativePath);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof SupabaseFileNotFoundError) {
      return jsonError("File not found", 404);
    }
    return handleApiError(error);
  }
}
