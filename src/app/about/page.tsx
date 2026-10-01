import type { Metadata } from "next";
import { ButtonLink, Card, Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "О платформе" };

export default function AboutPage() {
  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow="F16 Arena"
        title="О платформе"
        description="F16 Arena — турнирная система для LAN-соревнований по CS2. Мы только начинаем, и строим её так, чтобы турнир работал сам."
      />
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { t: "Для игроков", d: "До матча — сайт: команда, вето, подключение. Во время матча — только CS2. После — статистика, сетка и MVP." },
          { t: "Для организаторов", d: "Заявки, check-in, сетка и серверы управляются из одной админ-панели. Каждое ручное действие — в журнале." },
          { t: "Серверы", d: "Выделенные CS2-серверы с MatchZy в локальной сети F16. Доступ только для заявленных игроков." },
          { t: "Статистика", d: "Собственный плагин собирает каждое событие матча — из них считается F16 Rating и MVP турнира." },
        ].map((b) => (
          <Card key={b.t} className="p-6">
            <div className="font-semibold">{b.t}</div>
            <p className="mt-2 text-sm text-fg-3 leading-relaxed">{b.d}</p>
          </Card>
        ))}
      </div>
      <div className="mt-10 flex gap-3">
        <ButtonLink href="/tournaments">Турниры</ButtonLink>
        <ButtonLink href="/rules" variant="secondary">Правила</ButtonLink>
      </div>
    </Container>
  );
}
