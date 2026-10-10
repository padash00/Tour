"use client";

import { useEffect, useState } from "react";
import { Activity, Clock3, Radio, Terminal } from "lucide-react";
import type { SyncMetrics } from "@/lib/server/agent-report";
import { cn } from "@/components/ui";

export function AgentHealth({ lastSeen, initialNow, pending, inflight, metrics, dispatch, maintenance }: {
  lastSeen: string | null; initialNow: number; pending: number; inflight: number;
  metrics: SyncMetrics | null; dispatch: SyncMetrics | null; maintenance: SyncMetrics | null;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const age = lastSeen ? Math.max(0, Math.floor((now - Date.parse(lastSeen)) / 1000)) : null;
  const online = age !== null && Number.isFinite(age) && age < 30;
  const delayed = online && age >= 15;
  const jobs = [
    { label: "Игровые таймеры", metrics: dispatch, staleAfter: 30 },
    { label: "Обслуживание", metrics: maintenance, staleAfter: 150 },
  ];
  const jobCards = jobs.map(({ label, metrics: result, staleAfter }) => {
    const failed = result?.phases.filter((phase) => !phase.ok).length ?? 0;
    const stale = !!result && (now - Date.parse(result.at)) / 1000 > staleAfter;
    return {
      icon: Activity, label, value: result ? `${(result.duration_ms / 1000).toFixed(1)} с` : "Нет измерения",
      hint: failed ? `Задач с ошибкой: ${failed}` : stale ? "Последний запуск задерживается" : result ? "Время последнего запуска" : "Появится после обновления агента",
      tone: failed || stale ? "text-warn" : "text-fg",
    };
  });
  const cards = [
    { icon: Radio, label: "Связь с серверным ПК", value: online ? delayed ? "Сигнал задерживается" : "На связи" : "Нет связи",
      hint: age === null ? "Агент ещё не подключался" : `Последний сигнал ${age} с назад`,
      tone: online ? delayed ? "text-warn" : "text-ok" : "text-danger" },
    { icon: Clock3, label: "Очередь команд", value: `${pending} ожидают · ${inflight} отправлены`,
      hint: !online && pending > 0 ? "Команды ждут подключения агента" : "Результат появится после подтверждения агента", tone: pending > 0 ? "text-warn" : "text-fg" },
    { icon: Activity, label: "Обработка синхронизации", value: metrics ? `${(metrics.duration_ms / 1000).toFixed(1)} с` : "Нет измерения",
      hint: metrics ? "Время приёма состояния и выдачи команд" : "Нет измерения", tone: "text-fg" },
    ...jobCards,
  ];
  return (
    <section aria-label="Состояние управления серверами" className="space-y-3">
      {/* одна полоса на все показатели — без «сирот» в последнем ряду */}
      <div
        className="grid overflow-hidden rounded-surface border border-line bg-surface max-lg:divide-y max-lg:divide-white/[0.06] sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))] lg:divide-x lg:divide-white/[0.06]"
        style={{ "--n": cards.length } as React.CSSProperties}
      >
        {cards.map(({ icon: Icon, ...card }) => (
          <div key={card.label} className="min-w-0 p-4">
            <div className="flex items-center gap-2 text-xs text-fg-3"><Icon size={14} aria-hidden />{card.label}</div>
            <div className={cn("mt-2 text-base font-semibold", card.tone)}>{card.value}</div>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">{card.hint}</p>
          </div>
        ))}
      </div>
      <details className="rounded-surface border border-line bg-surface px-5 py-4">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-accent">Как запустить агент на этом ПК</summary>
        <div className="mt-4 max-w-3xl space-y-3 text-sm leading-relaxed text-fg-2">
          <p>Агент работает на компьютере с установленным CS2 Server. После входа в Windows он запускается автоматически в сеансе пользователя. Если процесс закрыть, сторож запустит его снова в течение минуты. Когда появится «На связи», кнопки ниже смогут запускать и останавливать игровые серверы.</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>На серверном ПК откройте Планировщик заданий Windows.</li>
            <li>Найдите задачу <strong>F16 Server Agent</strong> и нажмите «Выполнить».</li>
            <li>Дождитесь сигнала на этой странице. Обычно это занимает несколько секунд.</li>
          </ol>
          <p>Если задачи нет, откройте PowerShell от имени администратора и выполните команду для уже установленного сервера:</p>
          <div className="flex items-start gap-3 rounded-xl bg-bg p-3"><Terminal size={16} className="mt-1 shrink-0 text-accent" aria-hidden /><code className="break-all text-xs select-all">powershell -ExecutionPolicy Bypass -File D:\cs2server\f16\service.ps1</code></div>
          <p className="text-xs text-fg-3">Журнал запуска: D:\cs2server\f16\agent.log. Если сервер установлен на другом диске, замените путь. Для запуска выключенного агента требуется действие на серверном ПК.</p>
        </div>
      </details>
      {jobs.some((job) => job.metrics) && (
        <details className="rounded-surface border border-line bg-surface px-5 py-4">
          <summary className="cursor-pointer text-sm text-fg-2">Время фоновых задач</summary>
          {jobs.map(({ label, metrics: result }) => result && (
            <div key={label} className="mt-3">
              <p className="text-xs font-semibold text-fg-2">{label}</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {result.phases.map((phase) => <li key={phase.name} className="flex justify-between gap-4 text-xs"><span className={phase.ok ? "text-fg-3" : "text-danger"}>{phase.name}{phase.ok ? "" : " · ошибка"}</span><span className="num">{phase.ms} мс</span></li>)}
              </ul>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
