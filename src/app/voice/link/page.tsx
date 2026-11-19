import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { getVoiceLink, readVoiceToken } from "@/lib/voice";
import { VoiceLinkCard } from "@/components/voice-link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Привязка TeamSpeak"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

/** Сюда ведёт ссылка, которую бот присылает в канале «Привязка»: подтвердить, что это подключение TeamSpeak — ваш профиль */
export default async function VoiceLinkPage(props: PageProps<"/voice/link">) {
  const sp = await props.searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const link = readVoiceToken(token);
  const player = await getCurrentPlayer();
  // гость с рабочей ссылкой — сначала вход через Steam, потом вернём сюда же
  if (link && !player) redirect(`/login?next=${encodeURIComponent(`/voice/link?t=${token}`)}`);
  const current = link && player ? await getVoiceLink(player.id) : null;
  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center px-4 py-12">
      <VoiceLinkCard
        token={token}
        valid={!!link}
        player={player ? { nickname: player.nickname, avatar_url: player.avatar_url } : null}
        // профиль уже привязан к другому подключению — предупредим, что оно заменится
        replaces={current && link && current.ts_uid !== link.uid ? current.ts_nick || "TeamSpeak" : null}
        already={!!current && !!link && current.ts_uid === link.uid}
      />
    </div>
  );
}
