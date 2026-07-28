"use client";

/**
 * Toggle row for /mod/settings. Uses `Switch` + `Label htmlFor` (not a
 * wrapping `<label>`) so clicking the row's text also toggles the control —
 * matches `/mod/roster`'s "Show archived" switch (buttons aren't labelable
 * elements, so a wrapping `<label>` wouldn't forward the click/Space).
 */
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface SwitchFieldProps {
  id: string;
  testId: string;
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SwitchField({ id, testId, label, help, checked, onChange }: SwitchFieldProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <Label htmlFor={id} className="font-semibold block">
          {label}
        </Label>
        {help && (
          <span className="wc-help" style={{ margin: 0 }}>
            {help}
          </span>
        )}
      </div>
      <Switch id={id} data-testid={testId} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
