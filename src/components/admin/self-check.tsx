import { runSelfCheck } from "@/app/admin/servers/actions";
import { formatShortDateTime } from "@/lib/format";
import { selfCheckItems, type SelfCheckReport } from "@/lib/server/ops";
import { ActionForm, SubmitButton } from "@/components/forms";
import { cn } from "@/components/ui";
import { ADMIN_CARD } from "./control";

/** «Проверка перед турниром»: кнопка запуска и последний отчёт зелёным/красным */
export function SelfCheckPanel({ report, running, disabled }: { report: SelfCheckReport | null; running: boolean; disabled?: string | null }) {
  const items = report ? selfCheckItems(report) : [];
  const bad = items.filter((i) => i.ok === false).length;
  const unknown = items.filter((i) => i.ok == null).length;
  return (
    <div className={cn(ADMIN_CARD, "p-4")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          {running ? (
            <div className="text-[13px] text-accent">● Проверка идёт: агент запускает серверы и грузит карты…</div>
          ) : report ? (
            <div className={cn("text-[13px] font-medium", bad ? "text-danger" : unknown ? "text-warn" : "text-ok")}>
              {bad ? `Проблем: ${bad}` : unknown ? "Почти всё в порядке" : "Всё готово к турниру"}
              <span className="ml-2 font-normal text-fg-3">проверено {formatShortDateTime(report.finished_at)}</span>
            </div>
          ) : (
            <div className="text-[13px] text-fg-3">Проверки ещё не было. Запустите за час до турнира.</div>
          )}
        </div>
        <ActionForm action={runSelfCheck}>
          <SubmitButton
            size="sm"
            variant={report && !bad ? "secondary" : "primary"}
            confirm="Агент запустит выключенные активные серверы, загрузит на них de_mirage и проверит RCON, плагины, версию CS2 и Workshop-карты. Серверы с матчем не трогаются. Займёт 1–5 минут."
          >
            {running ? "Идёт…" : "Проверить перед турниром"}
          </SubmitButton>
        </ActionForm>
      </div>
      {disabled && <p className="mt-2 text-[12px] text-fg-3">{disabled}</p>}
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-3 py-2 text-[13px]">
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                  i.ok === true ? "bg-ok/15 text-ok" : i.ok === false ? "bg-danger/15 text-danger" : "bg-warn/15 text-warn",
                )}
                aria-label={i.ok === true ? "в порядке" : i.ok === false ? "проблема" : "не проверено"}
              >
                {i.ok === true ? "✓" : i.ok === false ? "✕" : "?"}
              </span>
              <span className="w-44 shrink-0 font-medium text-fg">{i.label}</span>
              <span className={cn("min-w-0 flex-1", i.ok === false ? "text-danger" : "text-fg-2")}>{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
