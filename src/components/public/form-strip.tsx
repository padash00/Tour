import { cn } from "../ui";
import { getT } from "@/lib/i18n/server";

/** Форма: последние результаты квадратами W/L, слева — самый свежий */
export async function FormStrip({ results, className, size = "md" }: { results: ("W" | "L")[]; className?: string; size?: "sm" | "md" }) {
  const t = await getT();
  return (
    <div className={cn("flex gap-1.5", className)} aria-label={t("Последние результаты: {list}", { list: results.join(" ") })}>
      {results.map((r, i) => (
        <span
          key={i}
          className={cn(
            "num grid place-items-center rounded-[6px] border font-semibold",
            size === "sm" ? "size-7 text-[11px]" : "size-9 text-[13px]",
            r === "W" ? "border-ok/40 bg-ok/[0.12] text-ok" : "border-danger/35 bg-danger/[0.1] text-danger",
          )}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
