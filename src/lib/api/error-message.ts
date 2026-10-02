export function getApiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong.";

  const raw = error.message;
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        message?: string | string[];
        error?: string;
      };
      if (Array.isArray(parsed.message)) return parsed.message.join(" ");
      // Machine codes lead some messages ("OCCURRENCE_CANCELLED: …", #106) —
      // tests and logs key off them; people only need the sentence.
      if (parsed.message) return parsed.message.replace(/^[A-Z][A-Z_]{2,}:\s*/, "");
      if (parsed.error) return parsed.error;
    } catch {
      // Fall through to a plain cleaned-up message.
    }
  }

  return raw.replace(/^\d{3}\s+[^:]+:\s*/, "") || "Something went wrong.";
}
