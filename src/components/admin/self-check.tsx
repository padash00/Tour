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
    <div className={cn(ADMIN_CARD, "p-5 sm:p-6")}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          {running ? (
            <div className="text-[17px] font-bold text-accent">Проверка идёт…</div>
          ) : report ? (
            <div className={cn("text-[17px] font-bold", bad ? "text-danger" : unknown ? "text-warn" : "text-ok")}>
              {bad ? `Найдено проблем: ${bad}` : unknown ? "Почти всё в порядке" : "Всё готово к турниру"}
            </div>
          ) : (
            <div className="text-[17px] font-bold text-fg">Проверки ещё не было</div>
          )}
          <p className="mt-1 text-[14px] text-fg-3">
            {running
              ? "Серверный ПК включает серверы и загружает на них карты. Это займёт несколько минут."
              : report
                ? `Последняя проверка: ${formatShortDateTime(report.finished_at)}. Запускайте её за час до начала турнира.`
                : "Запустите её за час до начала турнира: она сама проверит серверы, плагины, версию игры и карты."}
          </p>
        </div>
        <ActionForm action={runSelfCheck}>
          <SubmitButton
            size="md"
            variant={report && !bad ? "secondary" : "primary"}
            confirm="Серверный ПК включит выключенные серверы, загрузит на них de_mirage и проверит управление, плагины, версию CS2 и карты из Workshop. Серверы с матчем не трогаются. Займёт 1–5 минут."
          >
            {running ? "Идёт проверка…" : "Проверить перед турниром"}
          </SubmitButton>
        </ActionForm>
      </div>
      {disabled && <p className="mt-3 text-[14px] text-danger">{disabled}</p>}
      {items.length > 0 && (
        <ul className="mt-5 divide-y divide-ink/[0.06] border-t border-line-subtle">
          {items.map((i) => (
            <li key={i.label} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3 text-[15px]">
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-bold",
                  i.ok === true ? "bg-ok-dim text-ok" : i.ok === false ? "bg-danger-dim text-danger" : "bg-warn-dim text-warn",
                )}
                aria-label={i.ok === true ? "в порядке" : i.ok === false ? "проблема" : "не проверено"}
              >
                {i.ok === true ? "✓" : i.ok === false ? "✕" : "?"}
              </span>
              <span className="w-52 shrink-0 font-semibold text-fg">{i.label}</span>
              <span className={cn("min-w-0 flex-1 basis-60", i.ok === false ? "text-danger" : "text-fg-2")}>{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
