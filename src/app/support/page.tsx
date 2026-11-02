import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { supportPlayerId } from "@/lib/support";

export const metadata: Metadata = { title: "Поддержка", robots: { index: false } };
export const dynamic = "force-dynamic";

/** «Поддержка» — личная переписка с администратором (аккаунт из настройки SUPPORT_PLAYER_ID) */
export default async function SupportPage() {
  const me = await requirePlayer("/support");
  const id = await supportPlayerId();
  redirect(id && id !== me.id ? `/messages?with=${id}` : "/messages");
}
