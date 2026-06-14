"use client";

import { useGetHealth } from "@/lib/api/endpoints/health/health";

export default function Home() {
  const { data, isPending, isError } = useGetHealth();

  const health = isPending
    ? "checking…"
    : isError
      ? "API: offline (start the backend)"
      : (data as unknown as { status?: string } | undefined)?.status === "ok"
        ? "API: ok"
        : "API: ?";

  return (
    <main className="flex flex-1 items-center justify-center p-8 pb-28">
      <div className="max-w-xl text-center">
        <p className="font-mono text-sm text-gold">CIT-U · Cebu</p>
        <h1 className="mt-2 text-5xl font-black tracking-tight text-maroon">
          Wildcat Radio
        </h1>
        <p className="mt-4 text-foreground/70">
          Local-first internet radio — walking skeleton.
        </p>
        <span className="mt-6 inline-block rounded-full border border-maroon/20 px-3 py-1 font-mono text-xs">
          {health}
        </span>
      </div>
    </main>
  );
}
