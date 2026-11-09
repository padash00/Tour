"use client";

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { TeamLogo } from "@/components/ui";
import { cn } from "@/components/ds";

/*
 * Черновик сетки в пульте: карточки матчей первого раунда (выбор команд) и живая схема до финала.
 * Ничего не сохраняет сам — поля m{p}a / m{p}b уходят в manualBracketAction вместе с формой.
 * Выбор команды, которая уже стоит в другом слоте, меняет их местами — дублей не бывает.
 */

export type DraftTeam = { id: string; name: string; tag: string; logo: string | null; elo: number | null };
type Pair = [string | null, string | null];

const roundName = (r: number, k: number) => (r === k ? "Финал" : r === k - 1 ? "Полуфинал" : r === k - 2 ? "1/4 финала" : r === k - 3 ? "1/8 финала" : `Раунд ${r}`);

export function BracketDraft({ teams, initial, thirdPlace }: { teams: DraftTeam[]; initial: Pair[]; thirdPlace: boolean }) {
  const [pairs, setPairs] = useState<Pair[]>(initial);
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const sorted = useMemo(() => [...teams].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0)), [teams]);
  const placed = new Set(pairs.flat().filter(Boolean) as string[]);
  const missing = teams.filter((t) => !placed.has(t.id));

  const set = (p: number, side: 0 | 1, id: string | null) => {
    setPairs((cur) => {
      const next = cur.map((x) => [...x] as Pair);
      const old = next[p][side];
      if (id) {
        // команда уже в другом слоте — меняем местами
        for (let q = 0; q < next.length; q++)
          for (const s of [0, 1] as const) if (next[q][s] === id && !(q === p && s === side)) next[q][s] = old;
      }
      next[p][side] = id;
      return next;
    });
  };

  // схема: раунд 1 — пары; дальше — «Победитель М n», а при проходе без игры — сразу команда
  const k = Math.log2(pairs.length * 2);
  const rounds: { label: string; slots: (string | null)[][] }[] = [];
  let names: (string | null)[] = pairs.map(([a, b]) => (a && !b ? byId.get(a)!.name : b && !a ? byId.get(b)!.name : null));
  let numbers = pairs.map((_, i) => i + 1);
  let n = pairs.length;
  // больше половины пар — проход без игры: первый раунд — отборочные (18 команд в сетке на 32)
  const playIn = pairs.length >= 4 && pairs.filter(([a, b]) => !a || !b).length * 2 > pairs.length;
  rounds.push({ label: playIn ? "Отборочные" : roundName(1, k), slots: pairs.map(([a, b]) => [a ? byId.get(a)!.name : null, b ? byId.get(b)!.name : null]) });
  for (let r = 2; r <= k; r++) {
    const slots: (string | null)[][] = [];
    const nextNames: (string | null)[] = [];
    const nextNumbers: number[] = [];
    for (let i = 0; i < names.length; i += 2) {
      const s = [names[i] ?? `Победитель М${numbers[i]}`, names[i + 1] ?? `Победитель М${numbers[i + 1]}`];
      slots.push(s);
      nextNames.push(null);
      nextNumbers.push(++n);
    }
    rounds.push({ label: roundName(r, k), slots });
    names = nextNames;
    numbers = nextNumbers;
  }

  const slot = (p: number, side: 0 | 1) => {
    const id = pairs[p][side];
    const t = id ? byId.get(id) : null;
    return (
      <label
        className={cn(
          "relative flex h-14 items-center gap-3 rounded-control border px-3 transition-colors",
          t ? "border-line bg-surface hover:border-accent/50" : "border-dashed border-line bg-surface-2 text-fg-3",
        )}
      >
        {t ? <TeamLogo src={t.logo} tag={t.tag} size={32} /> : <span className="grid size-8 place-items-center rounded-[8px] border border-dashed border-line text-[12px]">—</span>}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[15px] font-semibold", t ? "text-fg" : "text-fg-3")}>{t ? t.name : "Проход без игры"}</span>
          {t && <span className="block text-[12.5px] text-fg-3">{t.elo ? `${t.elo} ELO` : "ELO нет"}</span>}
        </span>
        <span className="text-[12px] text-fg-3" aria-hidden>
          ▾
        </span>
        <select
          aria-label={`Матч ${p + 1}, ${side ? "вторая" : "первая"} команда`}
          value={id ?? ""}
          onChange={(e) => set(p, side, e.target.value || null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">— проход без игры —</option>
          {sorted.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.elo ?? "—"} ELO{placed.has(x.id) && x.id !== id ? " (поменять местами)" : ""}
            </option>
          ))}
        </select>
        <input type="hidden" name={`m${p}${side ? "b" : "a"}`} value={id ?? ""} />
      </label>
    );
  };

  return (
    <div className="space-y-6">
      {/* карточки матчей первого раунда */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pairs.map(([a, b], p) => (
          <div key={p} className={cn("rounded-surface border bg-surface-2/60 p-3", !a && !b ? "border-danger/50" : "border-line-subtle")}>
            <div className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">
              <span>Матч {p + 1}</span>
              {(!a || !b) && (a || b) && <span className="normal-case tracking-normal text-accent">проход дальше</span>}
            </div>
            <div className="space-y-1.5">
              {slot(p, 0)}
              <div className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-fg-3">vs</div>
              {slot(p, 1)}
            </div>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="rounded-control border border-warn/30 bg-warn-dim px-4 py-3 text-[14.5px] text-fg-2">
          Не расставлены: <span className="font-semibold text-fg">{missing.map((t) => t.name).join(", ")}</span> — поставьте их вместо «прохода без игры».
        </p>
      )}

      {/* живая схема до финала */}
      <div className="rounded-surface border border-line-subtle bg-surface p-4">
        <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-fg-3">Так будет выглядеть сетка</div>
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-6">
            {rounds.map((r, ri) => (
              <div key={ri} className="flex w-52 flex-col">
                <div className={cn("mb-2 text-[13px] font-bold", ri === rounds.length - 1 ? "text-accent" : "text-fg-2")}>
                  {ri === rounds.length - 1 && <Trophy className="mr-1 inline size-3.5" aria-hidden />}
                  {r.label}
                </div>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {r.slots.map((s, si) => (
                    <div key={si} className={cn("overflow-hidden rounded-[10px] border text-[13px]", ri === rounds.length - 1 ? "border-accent/60" : "border-line-subtle")}>
                      {s.map((name, ni) => (
                        <div
                          key={ni}
                          className={cn(
                            "truncate px-2.5 py-1.5",
                            ni === 1 && "border-t border-line-subtle",
                            !name ? "italic text-fg-3" : name.startsWith("Победитель") ? "text-fg-3" : "font-semibold text-fg",
                          )}
                        >
                          {name ?? "проход без игры"}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {thirdPlace && <p className="mt-3 text-[13px] text-fg-3">Проигравшие полуфиналов сыграют матч за 3-е место.</p>}
      </div>
    </div>
  );
}
