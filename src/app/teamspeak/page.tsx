import type { Metadata } from "next";
import { Container, EmptyState, PageTitle } from "@/components/ds";
import { VoiceCard } from "@/components/voice";
import { tr } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { getVoiceAddress } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Голосовая связь — TeamSpeak"),
    description: "Сервер TeamSpeak клуба F16 Arena: голосовая связь для команд во время турниров и лобби по CS2. Адрес сервера и как подключиться.",
    alternates: { canonical: "/teamspeak" },
  };
}
export const dynamic = "force-dynamic";

const STEPS = [
  { title: tr("Установите TeamSpeak"), text: tr("Программа бесплатная. Скачайте TeamSpeak 3 с официального сайта teamspeak.com, раздел Downloads, и установите.") },
  { title: tr("Зайдите на сервер клуба"), text: tr("Нажмите «Войти в TeamSpeak» на этой странице — программа откроется сразу на нашем сервере. Или в самой программе: Connections → Connect и вставьте адрес.") },
  { title: tr("Привяжите профиль"), text: tr("Зайдите в канал «Привязка». Бот пришлёт в личные сообщения ссылку — откройте её и подтвердите, что это вы. Привязка сохраняется: в следующий раз привязывать заново не нужно.") },
  { title: tr("Ждите игру в «Телепорте»"), text: tr("Перед матчем в лобби зайдите в канал «Телепорт». Когда игра начнётся, бот сам переведёт вас в закрытую комнату вашей команды, а после матча вернёт обратно.") },
];

/** «Голосовая связь»: адрес сервера TeamSpeak клуба и шаги: подключиться, привязать профиль, попасть в комнату команды */
export default async function TeamspeakPage() {
  const t = await getT();
  const address = await getVoiceAddress();
  return (
    <Container className="flex flex-col gap-6 pb-16 pt-8 sm:pt-10">
      <div>
        <PageTitle>{t("Голосовая связь — TeamSpeak")}</PageTitle>
        <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-fg-2">
          {t("У F16 Arena свой сервер TeamSpeak. Команды сидят в нём во время турниров и лобби: связь не зависит от игры и работает, даже когда вы ещё не на сервере CS2.")}
        </p>
      </div>
      {address ? <VoiceCard address={address} wide /> : <EmptyState title={t("Адрес сервера пока не указан")} text={t("Администратор добавит его в ближайшее время.")} />}
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 rounded-surface border border-line-subtle bg-surface p-5">
            <span className="grid size-9 place-items-center rounded-full bg-accent text-[15px] font-extrabold text-accent-ink">{i + 1}</span>
            <span className="text-[17px] font-bold text-fg">{t(s.title)}</span>
            <span className="text-[15px] text-fg-2">{t(s.text)}</span>
          </li>
        ))}
      </ol>
    </Container>
  );
}
