"use client";

import { useId, useState } from "react";
import { cn } from "./ui";

/** Число с кнопками − / + (счёт карты, seed) */
export function Stepper({
  name,
  defaultValue = 0,
  min = 0,
  max = 99,
  label,
}: {
  name: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  label?: string;
}) {
  const [v, setV] = useState(defaultValue);
  const set = (n: number) => setV(Math.min(max, Math.max(min, n)));
  return (
    <div>
      {label && <div className="mb-1.5 text-[13px] font-medium text-fg-2 truncate max-w-[180px]">{label}</div>}
      <div className="inline-flex items-center rounded-xl border border-line bg-bg-2">
        <button type="button" onClick={() => set(v - 1)} className="size-10 grid place-items-center text-lg text-fg-2 hover:text-fg">
          −
        </button>
        <input
          name={name}
          value={v}
          onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
          inputMode="numeric"
          className="w-12 bg-transparent text-center text-lg font-bold num outline-none"
        />
        <button type="button" onClick={() => set(v + 1)} className="size-10 grid place-items-center text-lg text-fg-2 hover:text-fg">
          +
        </button>
      </div>
    </div>
  );
}

/** Текстовое поле + готовые варианты, которые подставляются кликом */
export function ChipInput({
  name,
  chips,
  placeholder,
  className,
}: {
  name: string;
  chips: string[];
  placeholder?: string;
  className?: string;
}) {
  const [v, setV] = useState("");
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setV(c)}
            className={cn(
              "h-7 px-2.5 rounded-full border text-xs transition",
              v === c ? "border-[#8bb8ff55] bg-accent-dim text-accent" : "border-line text-fg-3 hover:text-fg-2",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <input name={name} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="field" />
    </div>
  );
}

export type PickPlayer = { steam_id: string; nickname: string; hint?: string };

/** Выбор игрока по нику (с подсказками) — в форму уходит SteamID64 */
export function PlayerPicker({
  name,
  players,
  placeholder = "Начните вводить ник или SteamID",
  suggested,
}: {
  name: string;
  players: PickPlayer[];
  placeholder?: string;
  /** быстрые варианты кнопками, например запасные команды */
  suggested?: PickPlayer[];
}) {
  const listId = useId();
  const [text, setText] = useState("");
  const match = players.find((p) => p.steam_id === text.trim() || p.nickname.toLowerCase() === text.trim().toLowerCase());
  const steamId = match?.steam_id ?? (/^\d{17}$/.test(text.trim()) ? text.trim() : "");
  return (
    <div>
      {suggested && suggested.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {suggested.map((p) => (
            <button
              key={p.steam_id}
              type="button"
              onClick={() => setText(p.nickname)}
              className={cn(
                "h-7 px-2.5 rounded-full border text-xs transition",
                match?.steam_id === p.steam_id ? "border-[#8bb8ff55] bg-accent-dim text-accent" : "border-line text-fg-3 hover:text-fg-2",
              )}
            >
              {p.nickname}
              {p.hint ? <span className="ml-1 text-fg-3">· {p.hint}</span> : null}
            </button>
          ))}
        </div>
      )}
      <input list={listId} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="field" />
      <datalist id={listId}>
        {players.map((p) => (
          <option key={p.steam_id} value={p.nickname}>
            {p.steam_id}
          </option>
        ))}
      </datalist>
      <input type="hidden" name={name} value={steamId} />
      <div className="mt-1 text-xs text-fg-3 num">
        {steamId ? `SteamID ${steamId}` : text ? "Игрок не найден — нужен ник с платформы или SteamID64" : ""}
      </div>
    </div>
  );
}
