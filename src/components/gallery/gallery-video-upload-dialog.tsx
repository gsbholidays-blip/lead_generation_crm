"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { requestSignedVideoUpload, uploadVideoToSignedUrl } from "@/lib/video-upload-client";

export function GalleryVideoUploadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleSubmit() {
    if (!file) {
      toast.error("Choose a video to upload");
      return;
    }

    setIsSubmitting(true);
    setProgress(0);
    try {
      // The video goes straight from this browser to Supabase Storage (see
      // requestSignedVideoUpload) — it never passes through this app's own
      // API, since Vercel would reject any real video there (~4.5MB body cap).
      const upload = await requestSignedVideoUpload("/api/gallery-videos/presign", file.type);
      await uploadVideoToSignedUrl(upload.signedUrl, file, setProgress);

      const res = await fetch("/api/gallery-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: upload.path,
          mimeType: upload.mimeType,
          caption: caption.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to upload video");
        return;
      }

      toast.success("Video uploaded");
      setOpen(false);
      setFile(null);
      setCaption("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
      setProgress(0);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Upload Video
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload gallery video</DialogTitle>
            <DialogDescription>Shows up on the gsb-holidays site once active.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Video</Label>
              <Input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-muted-foreground text-xs">MP4, WebM, or MOV, up to 100MB.</p>
            </div>
            <div className="space-y-2">
              <Label>Caption (optional)</Label>
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Sunset boat ride" />
            </div>
            {isSubmitting && (
              <div className="space-y-1">
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">Uploading… {progress}%</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
