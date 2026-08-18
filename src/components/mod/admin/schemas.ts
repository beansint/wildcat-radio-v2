/**
 * Zod schemas for the Staff Review promote/deactivate dialogs (BEA-184).
 * Exported standalone so they're unit-testable without mounting a component
 * (SR-WU-07/08/09) — the frontend's Vitest config runs `environment: 'node'`
 * with no jsdom.
 *
 * `REASON_MAX_LENGTH` mirrors the backend's `REASON_MAX_LENGTH` (500,
 * `wildcat-radio-v2-backend/apps/api/src/moderation/staff-review.service.ts`)
 * so a client that accepts more than the server does never produces an
 * avoidable 400.
 *
 * Both schemas `.trim()` before validating/emitting — a whitespace-only
 * reason ("   ") fails `.min(1)` (trimmed length 0) instead of slipping
 * through, and a valid reason is submitted already trimmed.
 */
import { z } from "zod";

export const REASON_MAX_LENGTH = 500;

const reasonField = z
  .string()
  .trim()
  .min(1, "Add a reason.")
  .max(REASON_MAX_LENGTH, `Keep it under ${REASON_MAX_LENGTH} characters.`);

export const promoteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email.")
    .email("Enter a valid campus email."),
  reason: reasonField,
});

export type PromoteFormValues = z.infer<typeof promoteSchema>;

export const deactivateSchema = z.object({
  reason: reasonField,
});

export type DeactivateFormValues = z.infer<typeof deactivateSchema>;
