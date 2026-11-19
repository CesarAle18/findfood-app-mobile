import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

/**
 * The current time in epoch milliseconds, refreshed on every minute boundary: enough for
 * labels that read `HH:mm`, without re-rendering every second. Each tick reads the clock
 * (a suspended JS thread fires the timer late) and schedules the next boundary from it.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        MINUTE_MS - (Date.now() % MINUTE_MS),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
