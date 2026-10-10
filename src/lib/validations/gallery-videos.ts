import { z } from "zod";
import { VIDEO_MIME_TYPES } from "@/lib/storage/supabase-file-storage";

const captionField = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

// The video itself is uploaded directly from the browser to Supabase Storage
// via a signed URL (see /api/gallery-videos/presign) — this only persists the
// resulting object key, after the fact.
export const createGalleryVideoSchema = z.object({
  caption: captionField,
  order: z.coerce.number().int().optional(),
  path: z.string().trim().min(1, "path is required"),
  mimeType: z.enum(VIDEO_MIME_TYPES),
});
export type CreateGalleryVideoInput = z.infer<typeof createGalleryVideoSchema>;

export const presignGalleryVideoSchema = z.object({
  contentType: z.enum(VIDEO_MIME_TYPES),
});

export const updateGalleryVideoSchema = z.object({
  caption: captionField,
  isActive: z.coerce.boolean().optional(),
  order: z.coerce.number().int().optional(),
});
export type UpdateGalleryVideoInput = z.infer<typeof updateGalleryVideoSchema>;
