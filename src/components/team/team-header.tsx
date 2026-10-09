import Link from "next/link";
import { ArrowLeft, ExternalLink, Settings } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import type { Team } from "@/lib/types";
import { Button, ContextNav, Eyebrow, Status, TeamLogo } from "@/components/ds";

/** Шапка штаба команды: идентичность, статус состава, действия + локальная навигация (липкая под оболочкой) */
export function TeamHeader({
  team,
  isCaptain,
  ready,
  mains,
  maxMain,
  actions,
  active,
  applications,
}: {
  team: Team;
  isCaptain: boolean;
  ready: boolean;
  mains: number;
  maxMain: number;
  actions?: ReactNode;
  /** settings — отдельная страница настроек, иначе вкладки штаба */
  active: "tabs" | "settings";
  /** капитану — вкладка «Заявки» с числом ожидающих */
  applications?: number;
}) {
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-4 pt-8 sm:pt-10">
        <TeamLogo src={team.logo_url} tag={team.tag} size="lg" />
        <div className="min-w-0 flex-1">
          <Eyebrow>Штаб команды · {team.tag}</Eyebrow>
          <h1 className="mt-1 truncate text-page text-fg">{team.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-3">
            <Status info={ready ? { label: "Состав собран", tone: "ok" } : { label: `Основа ${mains} из ${maxMain}`, tone: "warn" }} size="sm" />
            <span>{team.region ?? "Регион не указан"}</span>
            <span aria-hidden>·</span>
            <span>{isCaptain ? "Вы капитан" : "Вы игрок"}</span>
          </div>
        </div>
        <div className="-mx-1 flex w-[calc(100%+8px)] items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
          {actions}
          <Button href={`/teams/${encodeURIComponent(team.tag)}`} variant="ghost" size="md" iconRight={<ExternalLink />}>
            Публичная страница
          </Button>
          {active === "tabs" ? (
            <Button href="/team/settings" variant="secondary" size="md" icon={<Settings />}>
              Настройки
            </Button>
          ) : (
            <Button href="/team" variant="secondary" size="md" icon={<ArrowLeft />}>
              К штабу
            </Button>
          )}
        </div>
      </header>
      {active === "tabs" && (
        <Suspense fallback={<div className="mt-6 h-12 border-b border-line-subtle" />}>
          <ContextNav
            sticky
            match="tab"
            className="mt-6"
            items={[
              { key: "overview", label: "Обзор", href: "/team" },
              { key: "roster", label: "Состав", href: "/team?tab=roster" },
              { key: "matches", label: "Матчи", href: "/team?tab=matches" },
              { key: "tournaments", label: "Турниры", href: "/team?tab=tournaments" },
              ...(applications !== undefined ? [{ key: "applications", label: "Заявки", href: "/team?tab=applications", count: applications || undefined }] : []),
            ]}
          />
        </Suspense>
      )}
      {active === "settings" && (
        <nav className="mt-6 border-b border-line-subtle" aria-label="Раздел">
          <span className="-mb-px inline-flex h-12 items-center border-b-2 border-accent px-3 text-[14px] font-medium text-fg">Настройки</span>
          <Link href="/team" className="inline-flex h-12 items-center px-3 text-[14px] font-medium text-fg-3 hover:text-fg">
            Обзор
          </Link>
        </nav>
      )}
    </>
  );
}
