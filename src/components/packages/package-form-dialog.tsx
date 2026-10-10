"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, Loader2, Plus, X } from "lucide-react";

import { PACKAGE_TYPES, packageFormSchema, type PackageFormValues } from "@/lib/validations/packages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { DestinationRow } from "@/components/destinations/destinations-manager";
import { requestSignedVideoUpload, uploadVideoToSignedUrl } from "@/lib/video-upload-client";

export type PackageRow = {
  id: string;
  name: string;
  type: string;
  destinationId: string | null;
  price: string;
  priceKid: string;
  priceInfant: string;
  priceUnit: string;
  maxGuests: number;
  description: string;
  amenities: string[];
  note: string[];
  timings: string[];
  mealOptions: string[];
  activities: string[];
  highlights: string[];
  extraTitle: string | null;
  extraContent: string | null;
  imagePath: string;
  videoUrl: string | null;
  isActive: boolean;
  order: number;
  images: { id: string; imagePath: string }[];
  videos: { id: string; url: string }[];
};

const MEAL_OPTIONS = ["Veg", "Non-Veg"] as const;

/** Adds one gallery image to an already-created package — used both by the create flow (right after the package exists) and the edit flow. */
async function uploadGalleryImages(packageId: string, files: File[]) {
  const formData = new FormData();
  for (const file of files) formData.append("images", file);
  const res = await fetch(`/api/packages/${packageId}/images`, { method: "POST", body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to upload images");
  }
}

/**
 * Adds one or more gallery videos to an already-created package — used both
 * by the create flow (right after the package exists) and the edit flow.
 * Each file is uploaded directly from this browser to Supabase Storage via a
 * signed URL (see requestSignedVideoUpload) — never through this app's own
 * API — since Vercel would reject any real video there (~4.5MB body cap).
 * Only the resulting object keys are then sent to /videos to persist records.
 */
async function uploadGalleryVideos(packageId: string, files: File[], onProgress?: (percent: number) => void) {
  const uploaded: { path: string; mimeType: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const presigned = await requestSignedVideoUpload(`/api/packages/${packageId}/videos/presign`, file.type);
    await uploadVideoToSignedUrl(presigned.signedUrl, file, (filePercent) => {
      onProgress?.(Math.round(((i + filePercent / 100) / files.length) * 100));
    });
    uploaded.push({ path: presigned.path, mimeType: presigned.mimeType });
  }

  const res = await fetch(`/api/packages/${packageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videos: uploaded }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to upload videos");
  }
}

export function PackageFormDialog({
  mode,
  pkg,
  open,
  onOpenChange,
  destinations,
}: {
  mode: "create" | "edit";
  pkg?: PackageRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: DestinationRow[];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [galleryVideoFiles, setGalleryVideoFiles] = useState<File[]>([]);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: pkg
      ? {
          name: pkg.name,
          type: pkg.type as (typeof PACKAGE_TYPES)[number],
          destinationId: pkg.destinationId ?? "",
          price: Number(pkg.price),
          priceKid: Number(pkg.priceKid),
          priceInfant: Number(pkg.priceInfant),
          priceUnit: pkg.priceUnit,
          maxGuests: pkg.maxGuests,
          description: pkg.description,
          amenities: pkg.amenities.join("\n"),
          note: pkg.note.join("\n"),
          timings: pkg.timings.join("\n"),
          mealOptions: pkg.mealOptions,
          activities: pkg.activities.join("\n"),
          highlights: pkg.highlights.join("\n"),
          extraTitle: pkg.extraTitle ?? "",
          extraContent: pkg.extraContent ?? "",
          videoUrl: pkg.videoUrl ?? "",
          isActive: pkg.isActive,
          order: pkg.order,
        }
      : {
          name: "",
          type: "Villa",
          destinationId: "",
          price: 0,
          priceKid: 0,
          priceInfant: 0,
          priceUnit: "per night",
          maxGuests: 2,
          description: "",
          amenities: "",
          note: "",
          timings: "",
          mealOptions: [],
          activities: "",
          highlights: "",
          extraTitle: "",
          extraContent: "",
          videoUrl: "",
          isActive: true,
          order: 0,
        },
  });

  const watchedType = form.watch("type");
  const isVilla = watchedType === "Villa";

  // Villas are priced per-property, not per-person — zero out the kid/infant
  // rates when switching to Villa so no stale per-person price lingers unused.
  useEffect(() => {
    if (isVilla) {
      form.setValue("priceKid", 0);
      form.setValue("priceInfant", 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVilla]);

  async function handleDeleteExistingImage(imageId: string) {
    if (!pkg) return;
    setDeletingImageId(imageId);
    try {
      const res = await fetch(`/api/packages/${pkg.id}/images/${imageId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to remove image");
        return;
      }
      router.refresh();
    } finally {
      setDeletingImageId(null);
    }
  }

  async function handleDeleteExistingVideo(videoId: string) {
    if (!pkg) return;
    setDeletingVideoId(videoId);
    try {
      const res = await fetch(`/api/packages/${pkg.id}/videos/${videoId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to remove video");
        return;
      }
      router.refresh();
    } finally {
      setDeletingVideoId(null);
    }
  }

  async function onSubmit(values: PackageFormValues) {
    if (mode === "create" && !file) {
      form.setError("root", { message: "An image is required" });
      return;
    }

    setIsSubmitting(true);
    try {
      const splitLines = (value: string) =>
        value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      const amenities = splitLines(values.amenities);
      const note = splitLines(values.note);
      const timings = splitLines(values.timings);
      const activities = splitLines(values.activities);
      const highlights = splitLines(values.highlights);

      const formData = new FormData();
      formData.set("name", values.name);
      formData.set("type", values.type);
      formData.set("destinationId", values.destinationId);
      formData.set("price", String(values.price));
      formData.set("priceKid", String(values.priceKid));
      formData.set("priceInfant", String(values.priceInfant));
      formData.set("priceUnit", values.priceUnit);
      formData.set("maxGuests", String(values.maxGuests));
      formData.set("description", values.description);
      formData.set("amenities", JSON.stringify(amenities));
      formData.set("note", JSON.stringify(note));
      formData.set("timings", JSON.stringify(timings));
      formData.set("mealOptions", JSON.stringify(values.mealOptions));
      formData.set("activities", JSON.stringify(activities));
      formData.set("highlights", JSON.stringify(highlights));
      formData.set("extraTitle", values.extraTitle.trim());
      formData.set("extraContent", values.extraContent.trim());
      formData.set("videoUrl", values.videoUrl.trim());
      formData.set("isActive", String(values.isActive));
      formData.set("order", String(values.order));
      if (file) formData.set("image", file);
      if (mode === "create") {
        for (const galleryFile of galleryFiles) formData.append("images", galleryFile);
      }

      const res = await fetch(mode === "create" ? "/api/packages" : `/api/packages/${pkg!.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        body: formData,
      });
      const responseBody = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(responseBody.error ?? "Failed to save package");
        return;
      }

      // In edit mode, newly-picked gallery files aren't in the main PATCH body — upload them separately.
      if (mode === "edit" && galleryFiles.length > 0) {
        try {
          await uploadGalleryImages(pkg!.id, galleryFiles);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to upload images");
        }
      }

      // Videos always go straight from this browser to Supabase Storage
      // (see uploadGalleryVideos) rather than riding along in the package
      // create/update request body, so this runs as a follow-up call in both
      // modes once the package id is known.
      const packageId: string | undefined = mode === "create" ? responseBody.package?.id : pkg!.id;
      if (galleryVideoFiles.length > 0 && packageId) {
        setVideoUploadProgress(0);
        try {
          await uploadGalleryVideos(packageId, galleryVideoFiles, setVideoUploadProgress);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to upload videos");
        } finally {
          setVideoUploadProgress(null);
        }
      }

      toast.success(mode === "create" ? "Package created" : "Package updated");
      onOpenChange(false);
      if (mode === "create") {
        form.reset();
        setFile(null);
      }
      setGalleryFiles([]);
      setGalleryVideoFiles([]);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add a new package" : "Edit package"}</DialogTitle>
          <DialogDescription>
            Shows up on the gsb-holidays Packages page once active.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="GSB Royal Villa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PACKAGE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destinationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a destination" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {destinations
                          .filter((d) => d.isActive || d.id === field.value)
                          .map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxGuests"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Guests</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem className={isVilla ? "col-span-2" : undefined}>
                    <FormLabel>{isVilla ? "Total Villa Price" : "Price"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    {isVilla && (
                      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Priced for the entire villa, not per person.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isVilla && (
                <>
                  <FormField
                    control={form.control}
                    name="priceKid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price (Kids)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priceInfant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price (Infant)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <FormField
                control={form.control}
                name="priceUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price Unit</FormLabel>
                    <FormControl>
                      <Input placeholder="per night" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amenities"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Amenities (one per line)</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder={"Private deck\nAC bedrooms\nLake view"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Note (one per line, optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={"Shown as bullet points on the package page\nLeave blank to hide this section"}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timings"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Check-in / Check-out Timings (one per line)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        placeholder={"12:00 PM - 9:00 AM\n4:00 PM - 10:00 AM"}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mealOptions"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Meal</FormLabel>
                    <div className="flex items-center gap-4">
                      {MEAL_OPTIONS.map((option) => (
                        <div key={option} className="flex items-center gap-2">
                          <Checkbox
                            checked={field.value.includes(option)}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, option]
                                  : field.value.filter((v) => v !== option)
                              )
                            }
                          />
                          <Label className="font-normal">{option}</Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="activities"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Activities (one per line)</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder={"Cricket\nVolleyball\nBonfire"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="highlights"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Highlights (one per line)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={"Lakeside Cottages\nPrivate Swimming Pool"}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="extraTitle"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Extra Section Title (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Cancellation Policy" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="extraContent"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Extra Section Content</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="videoUrl"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Video URL (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://www.youtube.com/watch?v=..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end">
                    <div className="flex items-center justify-between">
                      <Label>Active (visible on site)</Label>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Cover Image</label>
              {pkg?.imagePath && !file && (
                // eslint-disable-next-line @next/next/no-img-element -- served from the CRM's own local-storage route, not next/image-optimizable at build time
                <img
                  src={`/api/public/files/${pkg.imagePath}`}
                  alt={pkg.name}
                  className="h-32 w-full rounded-lg object-cover"
                />
              )}
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {form.formState.errors.root && (
                <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Gallery Images</label>

              {mode === "edit" && pkg && pkg.images.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {pkg.images.map((img) => (
                    <div key={img.id} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- served from the CRM's own local-storage route */}
                      <img
                        src={`/api/public/files/${img.imagePath}`}
                        alt=""
                        className="h-16 w-full rounded-md object-cover"
                      />
                      <button
                        type="button"
                        disabled={deletingImageId === img.id}
                        onClick={() => handleDeleteExistingImage(img.id)}
                        className="bg-destructive absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-60"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {galleryFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {galleryFiles.map((f, i) => (
                    <span
                      key={`${f.name}-${i}`}
                      className="bg-muted flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                    >
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setGalleryFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <label className="border-input hover:bg-muted/50 flex w-fit cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Plus className="size-4" />
                Add Images
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    setGalleryFiles((prev) => [...prev, ...picked]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Gallery Videos</label>

              {mode === "edit" && pkg && pkg.videos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {pkg.videos.map((vid) => (
                    <div key={vid.id} className="group relative">
                      <video src={vid.url} controls className="h-24 w-full rounded-md object-cover" />
                      <button
                        type="button"
                        disabled={deletingVideoId === vid.id}
                        onClick={() => handleDeleteExistingVideo(vid.id)}
                        className="bg-destructive absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-60"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {galleryVideoFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {galleryVideoFiles.map((f, i) => (
                    <span
                      key={`${f.name}-${i}`}
                      className="bg-muted flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                    >
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setGalleryVideoFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <label className="border-input hover:bg-muted/50 flex w-fit cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Plus className="size-4" />
                Add Videos
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    setGalleryVideoFiles((prev) => [...prev, ...picked]);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-muted-foreground text-xs">MP4, WebM, or MOV, up to 100MB each.</p>
              {videoUploadProgress !== null && (
                <div className="space-y-1">
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${videoUploadProgress}%` }}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">Uploading videos… {videoUploadProgress}%</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                {mode === "create" ? "Create Package" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
