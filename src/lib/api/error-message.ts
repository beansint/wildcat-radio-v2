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
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
    } catch {
      // Fall through to a plain cleaned-up message.
    }
  }

  return raw.replace(/^\d{3}\s+[^:]+:\s*/, "") || "Something went wrong.";
}
