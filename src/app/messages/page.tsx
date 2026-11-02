import type { Metadata } from "next";
import { Container, PageTitle } from "@/components/ds";
import { MessagesApp } from "@/components/public/messages-app";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/dm";

export const metadata: Metadata = { title: "Сообщения", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MessagesPage(props: PageProps<"/messages">) {
  const sp = await props.searchParams;
  const withId = typeof sp.with === "string" && isUuid(sp.with) ? sp.with : null;
  await requirePlayer(withId ? `/messages?with=${withId}` : "/messages");
  return (
    <Container className="pb-16 pt-6 sm:pt-8">
      <PageTitle>Сообщения</PageTitle>
      <p className="mt-2 text-[15px] text-fg-2">Личная переписка с игроками. Без оскорблений и спама — на сообщение можно пожаловаться, игрока — заблокировать.</p>
      <div className="mt-6">
        <MessagesApp key={withId ?? "list"} withId={withId} />
      </div>
    </Container>
  );
}
