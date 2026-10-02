"use client";

import { OutlineBtn } from "../primitives";
import { useViewer } from "../viewer";

/** «Создать команду» гостю / «Моя команда» вошедшему — страница из кэша, кнопка уточняется на клиенте */
export function TeamCta({ className }: { className?: string }) {
  const { player } = useViewer();
  return (
    <OutlineBtn href={player ? "/team" : "/login?next=/team/create"} className={className}>
      {player ? "Моя команда" : "Создать команду"}
    </OutlineBtn>
  );
}
