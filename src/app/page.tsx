"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function Home() {
  const [health, setHealth] = useState("checking…");

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((r) => r.json())
      .then((d) => setHealth(d?.status === "ok" ? "API: ok" : "API: ?"))
      .catch(() => setHealth("API: offline (start the backend)"));
  }, []);

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
