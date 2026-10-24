import { formatShortDateTime } from "@/lib/format";
import type { AgentCommand } from "@/lib/server-control";
import { cn } from "@/components/ui";

const STATUS = {
  done: { label: "Выполнено", color: "text-ok bg-ok/10" },
  error: { label: "Ошибка", color: "text-danger bg-danger/10" },
  sent: { label: "Отправлено", color: "text-accent bg-accent/10" },
  pending: { label: "В очереди", color: "text-warn bg-warn/10" },
};
const TITLE: Record<AgentCommand["type"], string> = {
  start: "Запуск сервера", stop: "Остановка сервера", restart: "Перезапуск сервера",
  load_match: "Загрузка матча", end_match: "Завершение матча", rcon: "Команда консоли",
  update_cs2: "Обновление CS2", update_plugins: "Обновление плагинов", restart_all: "Перезапуск всех серверов",
  prefetch_maps: "Подготовка карт", self_check: "Проверка перед турниром",
  replay_failed_events: "Повтор отложенных событий",
};

export function CommandLog({ commands }: { commands: AgentCommand[] }) {
  if (!commands.length) return <p className="rounded-surface border border-dashed border-line p-6 text-[15px] text-fg-3">Команд ещё не было. Здесь появятся состояние выполнения и ответы агента.</p>;
  return (
    <ol className="divide-y divide-ink/[0.06] overflow-hidden rounded-surface bg-surface shadow-[inset_0_0_0_1px_var(--color-line-subtle),var(--shadow-soft)]">
      {commands.map((command) => {
        const status = STATUS[command.status];
        const seconds = command.done_at && command.sent_at ? Math.max(0, (Date.parse(command.done_at) - Date.parse(command.sent_at)) / 1000) : null;
        const reply = command.result ?? (command.status === "pending" ? "Ожидает получения агентом" : command.status === "sent" ? "Ожидает результата от агента" : "Ответ без сообщения");
        return (
          <li key={command.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[150px_220px_minmax(0,1fr)] lg:gap-5">
            <div className="flex items-center justify-between gap-3 lg:block">
              <span className={cn("inline-flex rounded-full px-3 py-1 text-[13px] font-semibold", status.color)}>{status.label}</span>
              <time dateTime={command.created_at} className="text-[13px] text-fg-3 lg:mt-2 lg:block">{formatShortDateTime(command.created_at)}</time>
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{TITLE[command.type] ?? command.type}</div>
              <div className="mt-1 text-[13px] text-fg-3"><span className="num">{command.instance ?? "Серверный ПК"}</span>{seconds !== null ? ` · ${seconds.toFixed(1)} с` : ""}</div>
              {command.type === "rcon" && <code className="mt-1 block break-all font-mono text-[13px] text-fg-3">{String(command.payload.command ?? "")}</code>}
              {command.delivery_attempts > 1 && <div className="mt-1 text-[13px] text-fg-3">Доставок: {command.delivery_attempts}</div>}
            </div>
            <div className="min-w-0 text-[14px] leading-relaxed text-fg-2">
              {reply.length > 160 ? (
                <details><summary className="cursor-pointer break-words focus-visible:outline-accent">{reply.split(/\r?\n/)[0].slice(0, 160)}…</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-control bg-surface-2 p-3 text-[13px]">{reply}</pre></details>
              ) : <p className="whitespace-pre-wrap break-words">{reply}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
