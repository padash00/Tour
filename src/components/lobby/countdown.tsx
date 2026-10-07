"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Часы комнаты: поправка к часам браузера по времени сервера (из ответа опроса).
 * Тикают только листовые <Countdown/> — комната целиком не перерисовывается 4 раза в секунду.
 */
const ClockOffset = createContext(0);
export const LobbyClock = ClockOffset.Provider;

function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

export const secondsLeft = (iso: string | null | undefined, now: number) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0);

/** Сколько секунд осталось до deadline — только число, подпись («с») снаружи */
export function Countdown({ deadline }: { deadline: string | null | undefined }) {
  const now = useNow(useContext(ClockOffset));
  return <>{secondsLeft(deadline, now)}</>;
}
