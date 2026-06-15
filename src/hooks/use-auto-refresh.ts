"use client";

import { useEffect, useRef } from "react";

/**
 * Refresh visible data on an interval and immediately when the PWA/tab
 * returns to the foreground. Focus + visibility events are deduplicated.
 */
export function useAutoRefresh(
  refresh: () => Promise<void> | void,
  intervalMs = 60_000,
) {
  const lastTriggeredAt = useRef(0);

  useEffect(() => {
    let followUpId: number | undefined;

    const trigger = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastTriggeredAt.current < 1_000) return;
      lastTriggeredAt.current = now;
      void Promise.resolve(refresh()).catch((err) => {
        console.error("[useAutoRefresh] refresh failed:", err);
      });
    };

    const triggerWithFollowUp = () => {
      trigger();
      if (followUpId !== undefined) window.clearTimeout(followUpId);
      followUpId = window.setTimeout(trigger, 5_000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") triggerWithFollowUp();
    };

    // useCachedFetch performs the immediate request. This follow-up picks up
    // cloud-backed statuses that the backend refreshed asynchronously.
    followUpId = window.setTimeout(trigger, 5_000);
    const intervalId = window.setInterval(trigger, intervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", triggerWithFollowUp);

    return () => {
      window.clearInterval(intervalId);
      if (followUpId !== undefined) window.clearTimeout(followUpId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", triggerWithFollowUp);
    };
  }, [intervalMs, refresh]);
}
