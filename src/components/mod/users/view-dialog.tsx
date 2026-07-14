"use client";

/**
 * /mod/users "View" dialog — a minimal read-only detail panel. The search
 * endpoint (`UserSummaryDto`) is already the full row shape shown in the
 * table, so this just re-presents it without truncation/formatting, plus
 * the raw mute/ban reason strings the table itself has no room for.
 */
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/mod/status-pill";
import type { UserSummaryDto } from "@/lib/api/model";
import { userStatus } from "./status";

interface ViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserSummaryDto;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm py-1.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <span className="wc-muted">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

export function ViewDialog({ open, onOpenChange, user }: ViewDialogProps) {
  const status = userStatus(user);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="mod-users-view-dialog">
        <DialogHeader>
          <DialogTitle>@{user.handle}</DialogTitle>
        </DialogHeader>

        <div className="wc-card wc-card-pad">
          <Row label="Email" value={user.email || "guest · no email"} />
          <Row label="Class" value={user.class} />
          <Row label="Role" value={user.role} />
          <Row
            label="Status"
            value={<StatusPill variant={status.variant}>{status.label}</StatusPill>}
          />
          <Row label="Strikes" value={`${user.activeStrikeCount} of 3`} />
          {user.muteReason && <Row label="Mute reason" value={user.muteReason} />}
          {user.banReason && <Row label="Ban reason" value={user.banReason} />}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
