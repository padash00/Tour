import { getVoiceAddress } from "@/lib/settings";
import { VoiceCard } from "./voice";

/** Блок «Голосовая связь» для серверных страниц; адрес не задан в пульте — блока нет */
export async function VoiceBlock({ wide, className }: { wide?: boolean; className?: string }) {
  const address = await getVoiceAddress();
  if (!address) return null;
  return <VoiceCard address={address} wide={wide} className={className} />;
}
