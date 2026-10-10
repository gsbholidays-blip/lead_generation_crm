import { z } from "zod";

export const LEAD_SORT_FIELDS = [
  "createdAt",
  "fullName",
  "lastActivityAt",
  "followUpDate",
] as const;

export const leadListQuerySchema = z
  .object({
    q: z.string().trim().optional(),
    statusId: z.string().optional(),
    source: z.enum(["FACEBOOK", "INSTAGRAM", "WHATSAPP", "MANUAL", "WEBSITE", "OTHER"]).optional(),
    assignedToId: z.string().optional(), // "unassigned" is a valid sentinel value
    createdFrom: z.coerce.date().optional(),
    createdTo: z.coerce.date().optional(),
    checkInFrom: z.coerce.date().optional(),
    checkInTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(LEAD_SORT_FIELDS).default("createdAt"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((data) => !data.createdFrom || !data.createdTo || data.createdTo >= data.createdFrom, {
    message: "End date must be on or after the start date",
    path: ["createdTo"],
  })
  .refine((data) => !data.checkInFrom || !data.checkInTo || data.checkInTo >= data.checkInFrom, {
    message: "End date must be on or after the start date",
    path: ["checkInTo"],
  });

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const createLeadSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  packageInterest: z.string().trim().max(200).optional(),
  source: z.enum(["FACEBOOK", "INSTAGRAM", "WHATSAPP", "MANUAL", "WEBSITE", "OTHER"]),
  statusId: z.string().min(1, "Status is required"),
  assignedToId: z.string().optional(),
  followUpDate: z.coerce.date().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// Client-side form schema: drops the coerced date field (not exposed in the
// add-lead form UI). The `email` field's transform means input/output types
// differ (transform always yields a defined-but-possibly-undefined key), so
// react-hook-form needs the pre-transform (input) and post-transform (output)
// shapes separately — see the 3-generic useForm signature in add-lead-dialog.
export const createLeadFormSchema = createLeadSchema.omit({ followUpDate: true });
export type CreateLeadFormInput = z.input<typeof createLeadFormSchema>;
export type CreateLeadFormOutput = z.output<typeof createLeadFormSchema>;

export const updateLeadSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  statusId: z.string().optional(),
  assignedToId: z.string().nullable().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const bulkAssignSchema = z.object({
  leadIds: z.array(z.string()).min(1),
  assignedToId: z.string(),
});

export const createNoteSchema = z.object({
  content: z.string().trim().min(1, "Note cannot be empty").max(5000),
  mentionedUserIds: z.array(z.string()).default([]),
});

export const updateNoteSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export const createFollowUpSchema = z.object({
  dueAt: z.coerce.date(),
  note: z.string().trim().max(2000).optional(),
});

export const updateFollowUpSchema = z.object({
  status: z.enum(["PENDING", "DONE", "MISSED", "CANCELLED"]),
});
