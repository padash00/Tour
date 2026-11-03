import { Suspense } from "react";
import { ContextNav } from "@/components/ds";
import { getT } from "@/lib/i18n/server";

/** Раздел «Команды»: список команд и поиск команды / игрока — один контекст */
export async function TeamsNav() {
  const t = await getT();
  return (
    <Suspense fallback={<div className="h-12 border-b border-line-subtle" />}>
      <ContextNav
        items={[
          { key: "teams", label: t("Все команды"), href: "/teams" },
          { key: "ranking", label: t("Рейтинг команд"), href: "/ranking" },
          { key: "find", label: t("Поиск команды и игроков"), href: "/find" },
        ]}
      />
    </Suspense>
  );
}
