import { useCallback, useEffect, useState } from "react";
import { ComingSoonError } from "./backend";

/** Load data from the backend; ComingSoonError becomes a flag instead of an error. */
export function useLoad<T>(fn: (() => Promise<T>) | null, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!fn) return;
    setLoading(true);
    try { setData(await fn()); setError(null); setComingSoon(false); }
    catch (e: any) { if (e instanceof ComingSoonError) setComingSoon(true); else setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, comingSoon, loading, reload };
}
