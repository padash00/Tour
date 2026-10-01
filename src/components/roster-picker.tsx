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
      <div className="mb-4 flex flex-wrap gap-6 text-[13px] uppercase tracking-[0.16em]">
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
                <div className="inline-flex rounded-[8px] border border-white/[0.08] bg-[#09111b] p-1">
                  {options.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      disabled={o.disabled}
                      onClick={() => set(m.player_id, o.v)}
                      className={cn(
                        "h-9 px-4 rounded-[6px] text-[13px] font-medium transition disabled:opacity-30",
                        s === o.v ? (o.v === "main" ? "bg-accent text-[#07101b]" : "bg-white/[0.08] text-fg") : "text-fg-3 hover:text-fg-2",
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
