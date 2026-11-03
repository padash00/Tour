import type { Metadata } from "next";
import { Container, PageTitle } from "@/components/ds";
import { SiteChat } from "@/components/public/site-chat";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Чат"),
    description: "Общий чат игроков F16 Arena: найти тиммейтов, договориться об игре, спросить о турнире.",
    alternates: { canonical: "/chat" },
  };
}

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const t = await getT();
  return (
    <Container width="read" className="pb-16 pt-6 sm:pt-8">
      <PageTitle>{t("Чат")}</PageTitle>
      <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
        {t("Общий чат игроков: найти тиммейтов, договориться об игре, спросить о турнире. Писать могут вошедшие через Steam. Без оскорблений и рекламы — за нарушения администратор удаляет сообщения и закрывает доступ к чату.")}
      </p>
      <div className="mt-6">
        <SiteChat />
      </div>
    </Container>
  );
}
