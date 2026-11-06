"use client";

import { useEffect, useRef, useState } from "react";

/** fetch JSON from our API; throws an Error carrying the server's message. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/**
 * Poll an endpoint while the tab is visible. Keeps the last good value on errors
 * so a blip doesn't blank the UI; exposes the error separately.
 */
export function usePoll<T>(path: string | null, ms: number, initial?: T) {
  const [data, setData] = useState<T | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!path) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (document.visibilityState === "visible") {
        try {
          const d = await api<T>(path);
          if (!stop && pathRef.current === path) {
            setData(d);
            setError(null);
          }
        } catch (e) {
          if (!stop) setError((e as Error).message);
        }
      }
      if (!stop) timer = setTimeout(run, ms);
    };
    run();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [path, ms, tick]);

  return { data, error, refresh: () => setTick((t) => t + 1), setData };
}
