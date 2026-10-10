import { z } from "zod";

// Amenities travel through multipart FormData as a JSON-encoded string array
// (FormData has no native array support) — parsed leniently so a malformed
// value just yields an empty list instead of failing the whole submission.
const amenitiesField = z.string().transform((value) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
  } catch {
    return [];
  }
});

const videoUrlField = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

const extraTitleField = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

const extraContentField = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

const destinationIdField = z
  .string()
  .trim()
  .max(100)
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

export const PACKAGE_TYPES = [
  "Villa",
  "Farmhouse",
  "Resort",
  "Cottage",
  "Camping",
  "Glamping",
  "Banquet",
] as const;

const rawPackageFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(PACKAGE_TYPES, { message: "Select a package type" }),
  destinationId: destinationIdField,
  price: z.coerce.number().min(0, "Price cannot be negative"),
  priceKid: z.coerce.number().min(0, "Price cannot be negative"),
  priceInfant: z.coerce.number().min(0, "Price cannot be negative"),
  priceUnit: z.string().trim().min(1).max(50),
  maxGuests: z.coerce.number().int().min(1, "At least 1 guest is required"),
  description: z.string().trim().min(1, "Description is required").max(2000),
  amenities: amenitiesField,
  note: amenitiesField,
  timings: amenitiesField,
  mealOptions: amenitiesField,
  activities: amenitiesField,
  highlights: amenitiesField,
  extraTitle: extraTitleField,
  extraContent: extraContentField,
  videoUrl: videoUrlField,
  isActive: z.coerce.boolean(),
  order: z.coerce.number().int(),
};

export const createPackageSchema = z.object({
  ...rawPackageFields,
  priceKid: rawPackageFields.priceKid.default(0),
  priceInfant: rawPackageFields.priceInfant.default(0),
  priceUnit: rawPackageFields.priceUnit.default("per night"),
  note: rawPackageFields.note.default([]),
  timings: rawPackageFields.timings.default([]),
  mealOptions: rawPackageFields.mealOptions.default([]),
  activities: rawPackageFields.activities.default([]),
  highlights: rawPackageFields.highlights.default([]),
  isActive: rawPackageFields.isActive.default(true),
  order: rawPackageFields.order.default(0),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = z.object({
  name: rawPackageFields.name.optional(),
  type: rawPackageFields.type.optional(),
  destinationId: rawPackageFields.destinationId,
  price: rawPackageFields.price.optional(),
  priceKid: rawPackageFields.priceKid.optional(),
  priceInfant: rawPackageFields.priceInfant.optional(),
  priceUnit: rawPackageFields.priceUnit.optional(),
  maxGuests: rawPackageFields.maxGuests.optional(),
  description: rawPackageFields.description.optional(),
  amenities: rawPackageFields.amenities.optional(),
  note: rawPackageFields.note.optional(),
  timings: rawPackageFields.timings.optional(),
  mealOptions: rawPackageFields.mealOptions.optional(),
  activities: rawPackageFields.activities.optional(),
  highlights: rawPackageFields.highlights.optional(),
  extraTitle: rawPackageFields.extraTitle,
  extraContent: rawPackageFields.extraContent,
  videoUrl: rawPackageFields.videoUrl,
  isActive: rawPackageFields.isActive.optional(),
  order: rawPackageFields.order.optional(),
});
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;

// Client-form-only variant — amenities/note/timings/activities/highlights stay
// as raw newline-separated text here and are split/JSON-encoded at submit
// time in the form dialog. mealOptions stays as a string array (checkboxes).
export const packageFormSchema = z.object({
  name: rawPackageFields.name,
  type: rawPackageFields.type,
  destinationId: z.string().min(1, "Select a destination"),
  price: z.number().min(0, "Price cannot be negative"),
  priceKid: z.number().min(0, "Price cannot be negative"),
  priceInfant: z.number().min(0, "Price cannot be negative"),
  priceUnit: rawPackageFields.priceUnit,
  maxGuests: z.number().int().min(1, "At least 1 guest is required"),
  description: rawPackageFields.description,
  amenities: z.string(),
  note: z.string(),
  timings: z.string(),
  mealOptions: z.array(z.string()),
  activities: z.string(),
  highlights: z.string(),
  extraTitle: z.string(),
  extraContent: z.string(),
  videoUrl: z.string(),
  isActive: z.boolean(),
  order: z.number().int(),
});
export type PackageFormValues = z.infer<typeof packageFormSchema>;
