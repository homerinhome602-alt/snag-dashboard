"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listQueuedSnags } from "@/lib/offline-queue";
import { syncOfflineQueue } from "@/lib/sync-queue";

export function PendingSyncBanner() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    const queue = await listQueuedSnags();
    setPending(queue.length);
  }, []);

  const trySync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const result = await syncOfflineQueue();
    setSyncing(false);
    setError(result.error);
    await refreshCount();
    if (result.synced.length > 0) router.refresh();
  }, [refreshCount, router]);

  useEffect(() => {
    refreshCount();
    trySync();
    window.addEventListener("online", trySync);
    return () => window.removeEventListener("online", trySync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-amber bg-amber px-4 py-1.5 text-[12px] text-amber-deep">
      <span>
        {pending} snag{pending === 1 ? "" : "s"} queued offline — will sync automatically once you&apos;re back
        online.
      </span>
      <button
        type="button"
        onClick={trySync}
        disabled={syncing}
        className="ml-auto font-medium underline-offset-2 hover:underline"
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
