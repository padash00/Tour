"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";

/** Запуск server action из комнаты: тост с ошибкой/успехом и перечитывание состояния */
export type Run = (fn: () => Promise<A.LobbyResult>, ok?: string) => void;

const POLL_MS = 1500;
/** Скрытая вкладка (игрок в CS2): редкий опрос — держит «в лобби» (онлайн 45 с) и ловит проверку готовности */
const HIDDEN_POLL_MS = 15_000;

/**
 * Состояние лобби: опрос /api/lobbies/[code] раз в 1,5 с, пока вкладка видна.
 * Скрытая вкладка не опрашивает вовсе; при возвращении — сразу запрос и опрос заново.
 * Ответ без изменений приходит как 304 (If-None-Match) — без тела и без перерисовки.
 */
export function useLobbyView(code: string, initial: LobbyView) {
  const [view, setView] = useState(initial);
  const [offset, setOffset] = useState(() => new Date(initial.now).getTime() - Date.now());
  // Пока server action сохраняет изменение, poll может получить snapshot,
  // который был собран ДО клика. Такой ответ нельзя применять к UI —
  // иначе toggle/select на мгновение откатывается назад.
  const mutations = useRef(0);
  const revision = useRef(0);
  const requestId = useRef(0);
  const appliedRequestId = useRef(0);
  // ETag последнего ПРИМЕНЁННОГО ответа (отброшенный ответ не должен превращать следующий в 304)
  const etag = useRef<string | null>(null);

  const load = useCallback(
    async () => {
      const startedAtRevision = revision.current;
      const startedDuringMutation = mutations.current > 0;
      const currentRequestId = ++requestId.current;
      try {
        const r = await fetch(`/api/lobbies/${code}`, { cache: "no-store", headers: etag.current ? { "If-None-Match": etag.current } : undefined });
        if (!r.ok) return; // 304 — ничего не изменилось
        const v = (await r.json()) as LobbyView;

        // Не применяем ответы, начавшиеся до клика или во время сохранения.
        // Один счётчик активных мутаций недостаточен: старый запрос может вернуться уже после их завершения.
        if (startedDuringMutation || mutations.current > 0 || startedAtRevision !== revision.current) return;
        if (currentRequestId < appliedRequestId.current) return;

        appliedRequestId.current = currentRequestId;
        etag.current = r.headers.get("ETag");
        setView(v);
        setOffset(new Date(v.now).getTime() - Date.now());
      } catch {
        // сеть моргнула — следующий опрос
      }
    },
    [code],
  );

  const beginMutation = useCallback(() => {
    revision.current += 1;
    mutations.current += 1;
    // после действия (в т.ч. с оптимистичным UI) нужен полный ответ, а не 304
    etag.current = null;
  }, []);

  const endMutation = useCallback(async () => {
    mutations.current = Math.max(0, mutations.current - 1);
    // Если пользователь быстро сделал несколько действий, ждём последнее.
    // Только оно возвращает UI к единственному authoritative server snapshot.
    if (mutations.current === 0) await load();
  }, [load]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let stop = false;
    const schedule = () => {
      clearTimeout(t);
      t = undefined;
      if (!stop) t = setTimeout(loop, document.visibilityState === "visible" ? POLL_MS : HIDDEN_POLL_MS);
    };
    const loop = async () => {
      await load();
      schedule();
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        // вкладка скрыта — опрашиваем редко, но не перестаём: иначе игрок «уходит» из лобби
        schedule();
        return;
      }
      clearTimeout(t);
      t = undefined;
      void loop();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { view, setView, load, offset, beginMutation, endMutation };
}

export function phaseOf(view: LobbyView) {
  const { lobby, game } = view;
  if (lobby.status === "closed") return "closed" as const;
  if (game?.status === "live") return "live" as const;
  if (game?.status === "veto") return "veto" as const;
  if (game?.status === "waiting") return "server" as const;
  if (lobby.ready_check_until) return "ready_check" as const;
  if (lobby.draft) return "draft" as const;
  return "waiting" as const;
}
