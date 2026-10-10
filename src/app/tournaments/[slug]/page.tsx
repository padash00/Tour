import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/data";
import { formatDateTime, formatMoney } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import { CLUB_CITY, ORGANIZER, absolute, snippet } from "@/lib/seo";
import type { Tournament } from "@/lib/types";
import { JsonLd } from "@/components/json-ld";
import { TournamentView } from "./tournament-view";

/** Описание для поиска: что, когда, где, режим, призы — из полей турнира */
function describe(t: Tournament) {
  const parts = [
    `Турнир по CS2 «${t.name}»`,
    t.starts_at ? `старт ${formatDateTime(t.starts_at)}` : null,
    t.city || t.is_lan ? `${t.is_lan ? "LAN, " : ""}${t.location ?? t.city ?? CLUB_CITY}` : null,
    modeOf(t.format).title,
    t.prize_pool ? `призовой фонд ${formatMoney(t.prize_pool)}` : null,
    t.status === "registration" ? "регистрация открыта" : null,
  ].filter(Boolean);
  return snippet(`${parts.join(", ")}. ${t.description ?? "Сетка, расписание и результаты матчей на F16 Arena."}`);
}

// страница одинакова для всех — из кэша CDN, обновляется раз в 30 с и сразу после изменений;
// черновик здесь не виден — админ смотрит его через /tournaments/<slug>/preview
export const revalidate = 30;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/tournaments/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) return { title: "Турнир" };
  const description = describe(t);
  return {
    title: `${t.name} — турнир по CS2`,
    description,
    alternates: { canonical: `/tournaments/${t.slug}` },
    openGraph: { title: t.name, description, type: "website", ...(t.cover_url ? { images: [{ url: t.cover_url }] } : {}) },
  };
}

export default async function TournamentPage(props: PageProps<"/tournaments/[slug]">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const url = absolute(`/tournaments/${t.slug}`);
  return (
    <>
      <JsonLd
        data={{
          "@type": "SportsEvent",
          name: t.name,
          sport: "Counter-Strike 2",
          url,
          description: describe(t),
          ...(t.starts_at ? { startDate: t.starts_at } : {}),
          ...(t.cover_url ? { image: [t.cover_url] } : {}),
          eventStatus: t.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
          eventAttendanceMode: t.is_lan ? "https://schema.org/OfflineEventAttendanceMode" : "https://schema.org/OnlineEventAttendanceMode",
          location: t.is_lan
            ? { "@type": "Place", name: t.location ?? "F16 Arena", address: { "@type": "PostalAddress", addressLocality: t.city ?? CLUB_CITY, addressCountry: "KZ" } }
            : { "@type": "VirtualLocation", url },
          organizer: ORGANIZER,
        }}
      />
      <TournamentView t={t} />
    </>
  );
}
