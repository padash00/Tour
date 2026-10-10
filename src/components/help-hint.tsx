import Link from "next/link";
import { ChevronDown, CircleHelp } from "lucide-react";
import { HELP, type HelpTopicId } from "@/lib/help";
import { cn } from "@/components/ds";

/**
 * Свёрнутая подсказка «как это работает» на странице. Без JS — нативный <details>.
 * Одна тема — заголовок темы; несколько — один блок «Как это работает» с темами внутри. Полный список — /help.
 */
export function HelpHint({ topics, open, className }: { topics: HelpTopicId[]; open?: boolean; className?: string }) {
  const single = topics.length === 1;
  return (
    <details open={open} className={cn("group rounded-control border border-line-subtle bg-surface", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium text-fg-2 hover:text-fg [&::-webkit-details-marker]:hidden">
        <CircleHelp className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          {single ? HELP[topics[0]].title : "Как это работает"}
          {!single && <span className="ml-2 font-normal text-fg-3">· {topics.length} {topics.length < 5 ? "темы" : "тем"}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line-subtle px-4 pb-4 pt-3">
        {single ? (
          <HelpBody id={topics[0]} />
        ) : (
          <div className="divide-y divide-line-subtle">
            {topics.map((id) => (
              <section key={id} className="py-4 first:pt-1">
                <h3 className="mb-3 text-[14px] font-semibold text-fg">{HELP[id].title}</h3>
                <HelpBody id={id} />
              </section>
            ))}
          </div>
        )}
        <Link href={`/help#${topics[0]}`} className="mt-3 inline-block text-meta font-medium text-accent hover:text-accent-strong">
          Все подсказки →
        </Link>
      </div>
    </details>
  );
}

/** Шаги и ограничения темы — общий вид для подсказки и страницы /help */
export function HelpBody({ id }: { id: HelpTopicId }) {
  const t = HELP[id];
  return (
    <>
      <ol className="space-y-2 text-[14px] leading-relaxed text-fg-2">
        {t.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="num grid size-6 shrink-0 place-items-center rounded-full border border-line text-micro font-semibold text-fg-3">{i + 1}</span>
            <span className="min-w-0 pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {t.notes?.length ? (
        <ul className="mt-3 space-y-1.5 border-t border-line-subtle pt-3 text-meta leading-relaxed text-fg-3">
          {t.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>•</span>
              <span className="min-w-0">{n}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
