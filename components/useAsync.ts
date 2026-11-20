'use client';

import { useCallback, useEffect, useState } from 'react';

/** Load async data and reload when deps change. With `keep`, a reload leaves the old data on screen
 *  until the new data arrives (so a form or confirmation doesn't unmount after an action). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], keep = false) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => (keep ? { ...s, loading: true } : { loading: true }));
    fn().then((data) => live && setState({ data, loading: false }), (e) => live && setState({ error: String(e?.message ?? e), loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
