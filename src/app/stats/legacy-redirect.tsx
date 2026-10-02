"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Старые ссылки /stats?t=<slug>&tab=… → /stats/<slug>?tab=… */
export function LegacyStatsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("t");
    if (!t) return;
    sp.delete("t");
    const q = sp.toString();
    router.replace(`/stats/${encodeURIComponent(t)}${q ? `?${q}` : ""}`);
  }, [router]);
  return null;
}
