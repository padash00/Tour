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
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
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
            <div key={m.player_id} className="flex flex-wrap items-center gap-3 min-h-14 py-2 border-b border-white/[0.05] last:border-0">
              <Avatar src={m.avatar_url} name={m.nickname} size={34} />
              <span className={cn("flex-1 min-w-[120px] font-medium truncate", s === "out" && "text-fg-3")}>{m.nickname}</span>
              <FaceitLevel level={m.faceit_level} />
              {m.banned ? (
                <span className="text-xs text-danger">заблокирован</span>
              ) : (
                <div className="inline-flex rounded-lg bg-white/[0.04] p-0.5">
                  {options.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      disabled={o.disabled}
                      onClick={() => set(m.player_id, o.v)}
                      className={cn(
                        "h-8 px-3 rounded-md text-xs font-medium transition disabled:opacity-30",
                        s === o.v ? "bg-surface-3 text-fg" : "text-fg-3 hover:text-fg-2",
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
