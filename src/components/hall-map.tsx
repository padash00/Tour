import { HALL_MAP, ZONE_LABEL, blockOfPc } from "@/lib/hall-core";
import { cn } from "@/components/ui";

export type HallTone = "mine" | "rival" | "busy" | "wait";
export type HallMark = { tone: HallTone; label?: string };

const TONE: Record<HallTone | "free", string> = {
  mine: "border-accent bg-accent text-white",
  rival: "border-danger/50 bg-danger/20 text-danger",
  busy: "border-accent/45 bg-accent/15 text-fg",
  wait: "border-warn/50 bg-warn/20 text-fg",
  free: "border-line bg-surface-4 text-fg-3",
};

/**
 * Схема зала клуба как в программе клуба: слева Standart (31–55), справа Standart Premium (1–30).
 * marks — подсветка блоков (по id блока): свои ПК, соперник, занято, ждёт.
 */
export function HallMap({ marks = {}, className }: { marks?: Record<string, HallMark>; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {HALL_MAP.map((zone) => {
        const cells = new Map(Object.entries(zone.pcs).map(([pc, [c, r]]) => [`${c}:${r}`, Number(pc)]));
        return (
          <div key={zone.zone} className={cn("rounded-surface border p-3", zone.zone === "premium" ? "border-line bg-surface-2" : "border-line-subtle bg-surface")}>
            <div className="mb-2 text-[13px] font-semibold text-fg-2">
              {zone.zone === "premium" ? "Standart Premium · ПК 1–30" : `${ZONE_LABEL[zone.zone]} · ПК 31–55`}
            </div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${zone.cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: zone.rows * zone.cols }, (_, i) => {
                const c = i % zone.cols;
                const r = Math.floor(i / zone.cols);
                const pc = cells.get(`${c}:${r}`);
                if (pc == null) {
                  const desk = zone.desk && zone.desk[0] === c && zone.desk[1] === r;
                  return (
                    <div key={i} className="flex h-8 items-center justify-center text-[11px] text-fg-3">
                      {desk ? "админ" : null}
                    </div>
                  );
                }
                const block = blockOfPc(pc);
                const mark = block ? marks[block] : undefined;
                return (
                  <div
                    key={i}
                    title={mark?.label ? `ПК ${pc} · ${mark.label}` : `ПК ${pc}`}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-[6px] border text-[13px] font-semibold num",
                      TONE[mark?.tone ?? "free"],
                      !block && "border-dashed",
                    )}
                  >
                    {pc}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
