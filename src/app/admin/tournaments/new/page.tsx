import type { Metadata } from "next";
import { createTournament } from "@/app/actions/admin";
import { getWorkshopMaps, getDisabledMaps, getMapImages } from "@/lib/settings";
import { AdminHeader } from "@/components/admin/control";
import { TournamentForm } from "../tournament-form";

export const metadata: Metadata = { title: "Новый турнир — F16 Control" };

export default async function NewTournamentPage() {
  return (
    <div className="space-y-8">
      <AdminHeader back={{ href: "/admin/tournaments", label: "Турниры" }} title="Новый турнир" />
      <TournamentForm
        action={createTournament}
        workshopMaps={await getWorkshopMaps()}
        disabledMaps={await getDisabledMaps()}
        mapImages={await getMapImages()}
      />
    </div>
  );
}
