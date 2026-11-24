import { useEffect, useRef, useState } from 'react';

/**
 * Counts a money figure up to a new value (e.g. a cash-out landing in the purse) with an ease-out.
 * Only increases with `animate` count; anything else snaps, so the figure never lies for long.
 * Presentation only: the authoritative value is rendered separately for assistive tech.
 */
export function useCountUp(value: number, animate: boolean, ms = 760): { readonly shown: number; readonly counting: boolean } {
  const [shown, setShown] = useState(value);
  const [counting, setCounting] = useState(false);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (!animate || value <= start || ms <= 0) {
      setShown(value);
      setCounting(false);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    setCounting(true);
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - u) ** 3;
      setShown(Math.round(start + (value - start) * e));
      if (u < 1) raf = requestAnimationFrame(tick);
      else setCounting(false);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setShown(value);
      setCounting(false);
    };
  }, [value, animate, ms]);
  return { shown, counting };
}
