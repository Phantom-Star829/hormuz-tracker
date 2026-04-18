"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Refreshes the RSC every INTERVAL_MS. Next.js returns cached RSC if the
// page hasn't revalidated yet (5min), so this is cheap on the server.
const INTERVAL_MS = 5 * 60 * 1000;

export default function AutoRefresh() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [nextIn, setNextIn] = useState(INTERVAL_MS);

  useEffect(() => {
    const refresh = () => {
      router.refresh();
      setLastRefresh(new Date());
      setNextIn(INTERVAL_MS);
    };
    const refreshTimer = setInterval(refresh, INTERVAL_MS);
    const tickTimer = setInterval(() => {
      setNextIn((n) => Math.max(0, n - 1000));
    }, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const mins = Math.floor(nextIn / 60000);
  const secs = Math.floor((nextIn % 60000) / 1000);

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted tabular">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-good opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-good" />
      </span>
      <span>Auto-refresh on</span>
      <span className="text-muted/70">·</span>
      <span>last {lastRefresh.toLocaleTimeString()}</span>
      <span className="text-muted/70">·</span>
      <span>next in {mins}:{secs.toString().padStart(2, "0")}</span>
    </div>
  );
}
