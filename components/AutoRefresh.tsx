'use client';

import { useEffect } from 'react';

/**
 * Signage robustness: guarantees the screen never freezes on a stale render.
 *
 * The boards already re-fetch data every 60s, but some players (OptiSigns
 * included) keep a long-lived webview that can suspend background timers or
 * serve a cached first render — which is how the screen got stuck on an old
 * snapshot. To survive that, we inject a browser-level `<meta http-equiv=
 * "refresh">` (handled by the rendering engine itself, not by JS) and keep a
 * JS reload as a fallback. After one fresh load, the page maintains itself.
 */
export default function AutoRefresh({ seconds = 300 }: { seconds?: number }) {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'refresh';
    meta.content = String(seconds);
    document.head.appendChild(meta);

    const id = window.setTimeout(() => window.location.reload(), seconds * 1000);

    return () => {
      meta.remove();
      window.clearTimeout(id);
    };
  }, [seconds]);

  return null;
}
