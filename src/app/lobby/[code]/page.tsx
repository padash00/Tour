import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { myTemplates } from "@/app/actions/lobby";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { lobbyMapCatalog } from "@/lib/lobby";
import { buildLobbyView } from "@/lib/lobby-view";
import { LobbyRoom } from "@/components/lobby/lobby-room";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/lobby/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  return { title: `Лобби #${code.toUpperCase()}` };
}

export default async function LobbyPage(props: PageProps<"/lobby/[code]">) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const invite = typeof sp.t === "string" ? sp.t : null;
  const player = await getCurrentPlayer();
  const [view, maps, templates] = await Promise.all([buildLobbyView(code, player, { admin: isAdmin(player) }), lobbyMapCatalog(), myTemplates()]);
  if (!view) notFound();
  return <LobbyRoom code={view.lobby.code} initial={view} maps={maps} templates={templates} invite={invite} origin={await siteOrigin()} />;
}
