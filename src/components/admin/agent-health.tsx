"use client";

import { useEffect, useState } from "react";
import { Activity, Clock3, Radio, Terminal } from "lucide-react";
import type { SyncMetrics } from "@/lib/server/agent-report";
import { cn } from "@/components/ui";
import { ADMIN_CARD } from "./control";

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
      hint: failed ? `Задач с ошибкой: ${failed}` : stale ? "Последний запуск задерживается" : result ? "Время последнего запуска" : "Появится после обновления программы на серверном ПК",
      tone: failed || stale ? "text-warn" : "text-fg",
    };
  });
  const cards = [
    { icon: Radio, label: "Связь с серверным ПК", value: online ? delayed ? "Сигнал задерживается" : "На связи" : "Нет связи",
      hint: age === null ? "Серверный ПК ещё ни разу не подключался" : `Последний сигнал ${age} с назад`,
      tone: online ? delayed ? "text-warn" : "text-ok" : "text-danger" },
    { icon: Clock3, label: "Очередь команд", value: `${pending} ожидают · ${inflight} отправлены`,
      hint: !online && pending > 0 ? "Команды ждут, пока серверный ПК выйдет на связь" : "Результат появится, когда серверный ПК подтвердит выполнение", tone: pending > 0 ? "text-warn" : "text-fg" },
    { icon: Activity, label: "Обмен данными с сайтом", value: metrics ? `${(metrics.duration_ms / 1000).toFixed(1)} с` : "Нет измерения",
      hint: metrics ? "Сколько занимает приём состояния и выдача команд" : "Нет измерения", tone: "text-fg" },
    ...jobCards,
  ];
  return (
    <section aria-label="Состояние управления серверами" className="space-y-4">
      {/* одна полоса на все показатели — без «сирот» в последнем ряду */}
      <div
        className={cn(ADMIN_CARD, "grid overflow-hidden max-lg:divide-y max-lg:divide-ink/[0.06] sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))] lg:divide-x lg:divide-ink/[0.06]")}
        style={{ "--n": cards.length } as React.CSSProperties}
      >
        {cards.map(({ icon: Icon, ...card }) => (
          <div key={card.label} className="min-w-0 p-5">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-fg-3"><Icon size={15} aria-hidden />{card.label}</div>
            <div className={cn("mt-2 text-[17px] font-bold", card.tone)}>{card.value}</div>
            <p className="mt-1 text-[13px] leading-snug text-fg-3">{card.hint}</p>
          </div>
        ))}
      </div>
      <details className={cn(ADMIN_CARD, "px-5 py-4")}>
        <summary className="cursor-pointer text-[15px] font-semibold focus-visible:outline-accent">Серверный ПК не на связи? Как его включить</summary>
        <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-fg-2">
          <p>На серверном ПК (там, где установлен CS2 Server) работает программа-помощник, которая принимает команды с сайта. После входа в Windows она запускается сама. Если её закрыли, сторож запустит её снова в течение минуты. Когда здесь появится «На связи», кнопки управления серверами заработают.</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>На серверном ПК откройте Планировщик заданий Windows.</li>
            <li>Найдите задачу <strong>F16 Server Agent</strong> и нажмите «Выполнить».</li>
            <li>Подождите несколько секунд: на этой странице появится сигнал.</li>
          </ol>
          <p>Если такой задачи нет, откройте PowerShell от имени администратора и выполните команду для уже установленного сервера:</p>
          <div className="flex items-start gap-3 rounded-control bg-surface-2 p-3"><Terminal size={16} className="mt-1 shrink-0 text-accent" aria-hidden /><code className="break-all font-mono text-[13px] select-all">powershell -ExecutionPolicy Bypass -File D:\cs2server\f16\service.ps1</code></div>
          <p className="text-[13px] text-fg-3">Журнал запуска: <span className="font-mono">D:\cs2server\f16\agent.log</span>. Если сервер установлен на другом диске, замените путь. Выключенную программу нельзя запустить с сайта, это делается на самом серверном ПК.</p>
        </div>
      </details>
      {jobs.some((job) => job.metrics) && (
        <details className={cn(ADMIN_CARD, "px-5 py-4")}>
          <summary className="cursor-pointer text-[15px] font-semibold text-fg-2">Подробно: сколько занимают фоновые задачи</summary>
          {jobs.map(({ label, metrics: result }) => result && (
            <div key={label} className="mt-4">
              <p className="text-[14px] font-semibold text-fg-2">{label}</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {result.phases.map((phase) => <li key={phase.name} className="flex justify-between gap-4 text-[13.5px]"><span className={phase.ok ? "text-fg-3" : "text-danger"}>{phase.name}{phase.ok ? "" : " · ошибка"}</span><span className="num">{phase.ms} мс</span></li>)}
              </ul>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
