"use client";

import { useEffect, useState } from "react";

export type ConnectionStatus = "live" | "demo" | "checking";

/** Polls /api/status to report whether the AI backend key is loaded. */
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("checking");

  useEffect(() => {
    let active = true;
    const check = () =>
      fetch("/api/status")
        .then((r) => r.json())
        .then((d: { connected?: boolean }) => {
          if (active) setStatus(d.connected ? "live" : "demo");
        })
        .catch(() => {
          if (active) setStatus("demo");
        });
    check();
    // Re-check periodically so the indicator refreshes if the env is fixed.
    const id = window.setInterval(check, 15000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return status;
}
