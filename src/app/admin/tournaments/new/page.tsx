import type { Metadata } from "next";
import Link from "next/link";
import { createTournament } from "@/app/actions/admin";
import { getWorkshopMaps } from "@/lib/settings";
import { TournamentForm } from "../tournament-form";

export const metadata: Metadata = { title: "Новый турнир" };

export default async function NewTournamentPage() {
  return (
    <div className="max-w-3xl">
      <Link href="/admin/tournaments" className="text-sm text-fg-3 hover:text-fg-2">
        ← Турниры
      </Link>
      <h1 className="mt-4 mb-8 text-3xl font-bold tracking-[-0.03em]">Новый турнир</h1>
      <TournamentForm action={createTournament} workshopMaps={await getWorkshopMaps()} />
    </div>
  );
}
