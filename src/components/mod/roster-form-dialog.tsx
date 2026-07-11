"use client";

/**
 * Add/edit DJ dialog — 1:1 with
 * docs/frontend-design-basis-prototype/mod/roster.html #mRoster.
 * Mounted only while open (page keeps it out of the tree when closed), so
 * each open gets a fresh `useForm` with the right defaults — no manual
 * reset-on-close plumbing needed.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  rosterControllerCreate,
  rosterControllerUpdate,
} from "@/lib/api/endpoints/roster/roster";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { RosterEntryDto } from "@/lib/api/model";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  displayName: z.string().trim().min(1, "Add a display name.").max(120, "Keep it under 120 characters."),
  bio: z.string().trim().max(2000, "Keep the bio under 2000 characters.").optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
});

type FormValues = z.infer<typeof schema>;

interface RosterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: RosterEntryDto | null;
  onSaved: () => void;
}

export function RosterFormDialog({ open, onOpenChange, entry, onSaved }: RosterFormDialogProps) {
  const isEdit = !!entry;
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: entry?.displayName ?? "",
      bio: entry?.bio ?? "",
      status: entry?.isActive === false ? "ARCHIVED" : "ACTIVE",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = {
        displayName: values.displayName.trim(),
        bio: values.bio?.trim() || undefined,
        isActive: values.status === "ACTIVE",
      };
      if (isEdit && entry) {
        return rosterControllerUpdate(entry.id, { body: JSON.stringify(body) });
      }
      return rosterControllerCreate({ body: JSON.stringify(body) });
    },
    onSuccess: () => onSaved(),
  });

  const alertMessage =
    errors.displayName?.message ??
    errors.bio?.message ??
    (saveMutation.isError ? getApiErrorMessage(saveMutation.error) : null);

  function onSubmit(values: FormValues) {
    saveMutation.mutate(values);
  }

  const busy = isSubmitting || saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit DJ" : "Add DJ"}</DialogTitle>
          <DialogDescription>
            This is a roster entry (public talent card), not a login account.
          </DialogDescription>
        </DialogHeader>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Label htmlFor="roster-name">Display name</Label>
          <Input
            id="roster-name"
            className="mb-3"
            placeholder="DJ Mara"
            data-testid="roster-name"
            disabled={busy}
            {...register("displayName")}
          />

          <Label htmlFor="roster-bio">Bio</Label>
          <Textarea
            id="roster-bio"
            rows={3}
            className="mb-3"
            placeholder="Cebuana coffee addict, spins OPM & chill R&B every afternoon."
            data-testid="roster-bio"
            disabled={busy}
            {...register("bio")}
          />

          <Label htmlFor="roster-status">Status</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                <SelectTrigger id="roster-status" className="mb-4" data-testid="roster-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="roster-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="roster-save">
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
