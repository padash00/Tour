"use client";

import { useState, type ReactNode } from "react";

/**
 * Подсветка пути команды по сетке: наведение или фокус на команду —
 * все её слоты по всей сетке подсвечиваются, остальные приглушаются.
 * Данные не трогает: слоты помечены data-team на сервере.
 */
export function BracketHover({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<string | null>(null);
  const pick = (el: EventTarget | null) => {
    const id = (el as HTMLElement | null)?.closest?.("[data-team]")?.getAttribute("data-team") ?? null;
    setTeam(id && /^[\w-]+$/.test(id) ? id : null);
  };
  return (
    <div
      data-bracket=""
      data-hl={team ? "" : undefined}
      onMouseOver={(e) => pick(e.target)}
      onMouseLeave={() => setTeam(null)}
      onFocus={(e) => pick(e.target)}
      onBlur={() => setTeam(null)}
    >
      {team && (
        <style>{`
[data-bracket][data-hl] [data-team]{opacity:.38;transition:opacity .15s}
[data-bracket][data-hl] [data-team="${team}"]{opacity:1;background:#8ab8ff1a;color:#f4f7fb}
[data-bracket][data-hl] [data-node]:has([data-team="${team}"]){border-color:#8ab8ff80}
`}</style>
      )}
      {children}
    </div>
  );
}
