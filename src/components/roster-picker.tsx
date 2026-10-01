"use client";

import { useState } from "react";
import { Avatar, FaceitLevel, cn } from "./ui";

type Member = { player_id: string; nickname: string; avatar_url: string | null; faceit_level: number | null; banned: boolean };
type Slot = "main" | "sub" | "out";

/** Капитан выбирает, кто играет в основе, кто в запасе, а кто не участвует в этом турнире */
export function RosterPicker({
  members,
  size,
  subs,
  initial,
}: {
  members: Member[];
  size: number;
  subs: number;
  initial: Record<string, Slot>;
}) {
  const [slots, setSlots] = useState<Record<string, Slot>>(initial);
  const count = (s: Slot) => Object.values(slots).filter((x) => x === s).length;
  const set = (id: string, s: Slot) => setSlots((cur) => ({ ...cur, [id]: s }));
  const mains = count("main");
  const benched = count("sub");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-6 text-[12px] font-medium uppercase tracking-[0.18em]" aria-live="polite">
        <span className={mains === size ? "text-ok" : "text-warn"}>
          Основа {mains}/{size}
        </span>
        {subs > 0 && (
          <span className={benched <= subs ? "text-fg-2" : "text-danger"}>
            Запас {benched}/{subs}
          </span>
        )}
      </div>
      <div>
        {members.map((m) => {
          const s = slots[m.player_id] ?? "out";
          const options: { v: Slot; label: string; disabled: boolean }[] = [
            { v: "main", label: "Основа", disabled: s !== "main" && mains >= size },
            ...(subs > 0 ? [{ v: "sub" as Slot, label: "Запас", disabled: s !== "sub" && benched >= subs }] : []),
            { v: "out", label: "Не играет", disabled: false },
          ];
          return (
            <div key={m.player_id} className="flex flex-wrap items-center gap-4 min-h-[68px] py-2 border-b border-white/[0.05] last:border-0">
              <Avatar src={m.avatar_url} name={m.nickname} size={42} />
              <span className={cn("flex-1 min-w-[120px] text-[16px] font-semibold truncate", s === "out" && "text-fg-3")}>{m.nickname}</span>
              <FaceitLevel level={m.faceit_level} />
              {m.banned ? (
                <span className="text-xs text-danger">заблокирован</span>
              ) : (
                <div role="radiogroup" aria-label={`Роль: ${m.nickname}`} className="inline-flex rounded-[9px] border border-white/[0.08] bg-[#09111b] p-1">
                  {options.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={s === o.v}
                      disabled={o.disabled}
                      onClick={() => set(m.player_id, o.v)}
                      className={cn(
                        "h-10 rounded-[7px] px-4 text-[13px] font-medium transition-colors duration-150 disabled:opacity-30",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                        s === o.v ? (o.v === "main" ? "bg-accent text-accent-ink" : "bg-white/[0.1] text-fg") : "text-fg-3 hover:text-fg-2",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {s === "main" && <input type="hidden" name="main" value={m.player_id} />}
              {s === "sub" && <input type="hidden" name="sub" value={m.player_id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
