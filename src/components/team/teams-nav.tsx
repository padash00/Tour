import { Suspense } from "react";
import { ContextNav } from "@/components/ds";

/** Раздел «Команды»: список команд и поиск команды / игрока — один контекст */
export function TeamsNav() {
  return (
    <Suspense fallback={<div className="h-12 border-b border-line-subtle" />}>
      <ContextNav
        items={[
          { key: "teams", label: "Все команды", href: "/teams" },
          { key: "find", label: "Поиск команды и игроков", href: "/find" },
        ]}
      />
    </Suspense>
  );
}
