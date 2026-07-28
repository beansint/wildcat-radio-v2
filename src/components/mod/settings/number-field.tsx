"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberFieldProps {
  id: string;
  testId: string;
  label: string;
  unit?: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
}

/** Numeric input with the unit spelled out in the label (SET-U-06 — never a
 * free-text "24h" field like the prototype). */
export function NumberField({ id, testId, label, unit, help, value, onChange }: NumberFieldProps) {
  return (
    <div className="mb-4">
      <Label htmlFor={id} className="mb-1 block">
        {label}
        {unit ? <span className="wc-muted font-normal"> ({unit})</span> : null}
      </Label>
      <Input
        id={id}
        type="number"
        className="tnum"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {help && <p className="wc-help">{help}</p>}
    </div>
  );
}
