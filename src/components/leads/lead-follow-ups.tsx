"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type FollowUp = {
  id: string;
  dueAt: string;
  note: string | null;
  status: "PENDING" | "DONE" | "MISSED" | "CANCELLED";
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-blue-500/10 text-blue-600",
  DONE: "bg-green-500/10 text-green-600",
  MISSED: "bg-red-500/10 text-red-600",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function LeadFollowUps({ leadId, followUps }: { leadId: string; followUps: FollowUp[] }) {
  const router = useRouter();
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    status: "DONE" | "CANCELLED";
  } | null>(null);

  async function create() {
    if (!dueAt) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueAt: new Date(dueAt).toISOString(), note: note || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to schedule follow-up");
        return;
      }
      setDueAt("");
      setNote("");
      toast.success("Follow-up scheduled");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: "DONE" | "CANCELLED") {
    const res = await fetch(`/api/leads/${leadId}/follow-ups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("Failed to update follow-up");
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Follow-ups</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="sm:w-56"
          />
          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button onClick={create} disabled={isSubmitting || !dueAt} className="shrink-0">
            {isSubmitting && <Loader2 className="animate-spin" />}
            Schedule
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          {followUps.length === 0 ? (
            <p className="text-muted-foreground text-sm">No follow-ups scheduled.</p>
          ) : (
            followUps.map((fu) => (
              <div
                key={fu.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{format(new Date(fu.dueAt), "d MMM yyyy, h:mm a")}</p>
                  {fu.note && <p className="text-muted-foreground">{fu.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("border-none", STATUS_STYLES[fu.status])}>{fu.status}</Badge>
                  {fu.status === "PENDING" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 rounded-full border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
                        onClick={() => setConfirmTarget({ id: fu.id, status: "DONE" })}
                        title="Mark done"
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                        onClick={() => setConfirmTarget({ id: fu.id, status: "CANCELLED" })}
                        title="Cancel follow-up"
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={confirmTarget?.status === "DONE" ? "Mark follow-up as done?" : "Cancel follow-up?"}
        description={
          confirmTarget?.status === "DONE"
            ? "This will mark the follow-up as completed."
            : "This cannot be undone."
        }
        confirmLabel={confirmTarget?.status === "DONE" ? "Mark done" : "Cancel follow-up"}
        cancelLabel="Back"
        variant={confirmTarget?.status === "CANCELLED" ? "destructive" : "default"}
        onConfirm={() => {
          if (confirmTarget) updateStatus(confirmTarget.id, confirmTarget.status);
        }}
      />
    </Card>
  );
}
