import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlayer } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { isServerSkins } from "@/lib/settings";
import { getLoadout } from "@/lib/skins";
import { Container, Eyebrow, PageTitle } from "@/components/ds";
import { SkinEditor } from "@/components/skins/editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Мои скины"), robots: { index: false } };
}

/** Скины игрока на серверах клуба: привязаны к Steam-аккаунту, которым он вошёл на сайт */
export default async function SkinsPage() {
  const t = await getT();
  const player = await requirePlayer("/me/skins");
  const [view, enabled] = await Promise.all([getLoadout(player.steam_id), isServerSkins().catch(() => true)]);
  return (
    <Container className="pb-16 pt-6 sm:pt-8">
      <Link href="/me" className="-ml-1 inline-flex min-h-11 items-center gap-1 text-meta text-fg-3 hover:text-fg sm:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        {t("Моя игра")}
      </Link>
      <header className="mb-6 mt-3">
        <Eyebrow tone="accent">{t("Серверы F16 Arena")}</Eyebrow>
        <PageTitle className="mt-1">{t("Мои скины")}</PageTitle>
        <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
          {t("Соберите набор для каждой стороны: оружие, нож, перчатки, износ. Он привязан к вашему Steam-аккаунту и действует на серверах клуба — в лобби и свободной игре. То, что вы выбрали в игре через !skins, уже здесь.")}
        </p>
      </header>
      <SkinEditor loadout={view.loadout} pending={view.pending} stale={view.stale} enabled={enabled} />
    </Container>
  );
}
