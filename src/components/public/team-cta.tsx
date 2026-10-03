"use client";

import { Button } from "@/components/ds";
import { useViewer } from "../viewer";

/** «Создать команду» гостю / «Моя команда» вошедшему — страница из кэша, кнопка уточняется на клиенте */
export function TeamCta({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const { player } = useViewer();
  return (
    <Button href={player ? "/team" : "/login?next=/team/create"} variant="secondary" size={size} className={className}>
      {player ? "Моя команда" : "Создать команду"}
    </Button>
  );
}
