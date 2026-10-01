"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { countApproved, getPlayerBySteamId, getTournamentById } from "@/lib/data";
import { fromLocalInput } from "@/lib/format";
import { closeMatchesOfEndedTournaments, enqueueCommand, enqueuePrefetch } from "@/lib/server-control";
import { slugify } from "@/lib/maps";
import { db } from "@/lib/supabase";
import type { PrizeRow, TournamentStatus } from "@/lib/types";
import type { ActionResult } from "@/components/forms";

const STATUSES: TournamentStatus[] = [
  "draft",
  "registration",
  "registration_closed",
  "checkin",
  "live",
  "finished",
  "cancelled",
];

const tournamentSchema = z.object({
  name: z.string().trim().min(3, "Название — минимум 3 символа").max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,48}$/, "Адрес — 3–48 символов: латиница в нижнем регистре, цифры и дефис"),
  format: z.string().trim().min(1).max(20),
  bracket_type: z.enum(["double_elimination", "single_elimination", "round_robin", "groups_playoff", "swiss", "swiss_playoff"]),
  groups_count: z.coerce.number().int().min(1).max(8).default(2),
  advance_per_group: z.coerce.number().int().min(1).max(8).default(2),
  swiss_wins: z.coerce.number().int().min(1).max(5).default(3),
  playoff_type: z.enum(["single_elimination", "double_elimination"]).default("single_elimination"),
  max_teams: z.coerce.number().int().min(2).max(64),
  default_best_of: z.coerce.number().refine((n) => [1, 3, 5].includes(n)).default(1),
  final_best_of: z.coerce.number().refine((n) => [1, 3, 5].includes(n)).default(3),
  overtime: z.string().optional(),
  knife_round: z.string().optional(),
  timeouts_per_team: z.coerce.number().int().min(0).max(10).default(3),
  timeout_seconds: z.coerce.number().int().min(15).max(120).default(30),
  tech_pauses: z.coerce.number().int().min(0).max(10).default(2),
  tech_pause_seconds: z.coerce.number().int().min(60).max(900).default(300),
  stream_url: z.union([z.literal(""), z.string().trim().url("Трансляция — полная ссылка https://…")]).optional().default(""),
  discord_url: z.union([z.literal(""), z.string().trim().url("Discord — полная ссылка https://…")]).optional().default(""),
  contact: z.string().trim().max(120).optional().default(""),
  entry_fee: z.string().trim().max(80).optional().default(""),
  sponsors: z.string().optional().default("[]"),
  location: z.string().trim().max(120).optional().default(""),
  is_lan: z.string().optional(),
  prize_pool: z.string().trim().max(60).optional().default(""),
  prizes: z.string().optional().default(""),
  match_format: z.string().trim().max(200).optional().default(""),
  map_pool: z.string().trim().min(1, "Выберите хотя бы одну карту"),
  description: z.string().trim().max(4000).optional().default(""),
  requirements: z.string().trim().max(4000).optional().default(""),
  rules: z.string().trim().max(20000).optional().default(""),
  starts_at: z.string().optional(),
  registration_opens_at: z.string().optional(),
  registration_closes_at: z.string().optional(),
  checkin_opens_at: z.string().optional(),
  checkin_closes_at: z.string().optional(),
});

function parsePrizes(text: string): PrizeRow[] {
  // строки вида "1 место — 300 000 ₸"
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [place, ...rest] = line.split(/\s+[—–-]\s+|:\s*/);
      return { place: place.trim(), prize: rest.join(" — ").trim() };
    });
}

function parseSponsors(raw: string) {
  try {
    const list = JSON.parse(raw) as { name?: string; url?: string }[];
    return list
      .filter((x) => x?.name?.trim())
      .slice(0, 12)
      .map((x) => {
        const url = x.url?.trim();
        return { name: x.name!.trim().slice(0, 60), ...(url && /^https?:\/\//.test(url) ? { url } : {}) };
      });
  } catch {
    return [];
  }
}

function tournamentRow(data: z.infer<typeof tournamentSchema>) {
  return {
    name: data.name,
    slug: data.slug,
    format: data.format,
    bracket_type: data.bracket_type,
    groups_count: data.groups_count,
    advance_per_group: data.advance_per_group,
    swiss_wins: data.swiss_wins,
    playoff_type: data.playoff_type,
    max_teams: data.max_teams,
    default_best_of: data.default_best_of,
    final_best_of: data.final_best_of,
    overtime: data.overtime === "on",
    knife_round: data.knife_round === "on",
    timeouts_per_team: data.timeouts_per_team,
    timeout_seconds: data.timeout_seconds,
    tech_pauses: data.tech_pauses,
    tech_pause_seconds: data.tech_pause_seconds,
    stream_url: data.stream_url || null,
    discord_url: data.discord_url || null,
    contact: data.contact || null,
    entry_fee: data.entry_fee || null,
    sponsors: parseSponsors(data.sponsors),
    location: data.location || null,
    is_lan: data.is_lan === "on",
    prize_pool: data.prize_pool || null,
    prize_distribution: parsePrizes(data.prizes),
    match_format: data.match_format || null,
    map_pool: data.map_pool
      .split(/[\s,]+/)
      .map((m) => (m.includes("@") ? m.trim() : m.trim().toLowerCase()))
      .filter(Boolean)
      .map((m) => (m.includes("@") || /^(de|aim|cs|ar|fy|awp)_/.test(m) ? m : `de_${m}`)),
    description: data.description || null,
    requirements: data.requirements || null,
    rules: data.rules || null,
    starts_at: fromLocalInput(data.starts_at),
    registration_opens_at: fromLocalInput(data.registration_opens_at),
    registration_closes_at: fromLocalInput(data.registration_closes_at),
    checkin_opens_at: fromLocalInput(data.checkin_opens_at),
    checkin_closes_at: fromLocalInput(data.checkin_closes_at),
    updated_at: new Date().toISOString(),
  };
}

async function uploadCover(tournamentId: string, formData: FormData): Promise<string | null | { error: string }> {
  const file = formData.get("cover") as File | null;
  if (!file || file.size === 0) return null;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { error: "Обложка — PNG, JPG или WEBP" };
  if (file.size > 3 * 1024 * 1024) return { error: "Обложка — не больше 3 МБ" };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${tournamentId}/${Date.now()}.${ext}`;
  const { error } = await db()
    .storage.from("tournament-covers")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (error) return { error: "Не удалось загрузить обложку" };
  const url = db().storage.from("tournament-covers").getPublicUrl(path).data.publicUrl;
  await db().from("tournaments").update({ cover_url: url }).eq("id", tournamentId);
  return url;
}

function withSlug(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, unknown>;
  if (!String(raw.slug ?? "").trim()) raw.slug = slugify(String(raw.name ?? ""));
  return raw;
}

export async function createTournament(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = tournamentSchema.safeParse(withSlug(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await db().from("tournaments").insert(tournamentRow(parsed.data)).select("id").single();
  if (error || !data) {
    return { error: error?.code === "23505" ? "Турнир с таким адресом уже есть" : "Не удалось создать турнир" };
  }
  await uploadCover(data.id, formData);
  await audit(admin.id, "tournament.create", { type: "tournament", id: data.id }, { name: parsed.data.name });
  redirect(`/admin/tournaments/${data.id}`);
}

export async function updateTournament(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const parsed = tournamentSchema.safeParse(withSlug(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await db().from("tournaments").update(tournamentRow(parsed.data)).eq("id", id);
  if (error) return { error: error.code === "23505" ? "Турнир с таким адресом уже есть" : "Не удалось сохранить" };
  if (formData.get("removeCover") === "on") await db().from("tournaments").update({ cover_url: null }).eq("id", id);
  const cover = await uploadCover(id, formData);
  if (cover && typeof cover === "object") return cover;
  await audit(admin.id, "tournament.update", { type: "tournament", id });
  revalidatePath("/", "layout");
  return { success: "Сохранено" };
}

export async function setTournamentStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as TournamentStatus;
  if (!STATUSES.includes(status)) return { error: "Неизвестный статус" };

  const before = await getTournamentById(id);
  if (!before) return { error: "Турнир не найден" };
  await db().from("tournaments").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  await audit(admin.id, "tournament.status", { type: "tournament", id }, { from: before.status, to: status });

  if (status === "finished" || status === "cancelled") {
    const closed = await closeMatchesOfEndedTournaments(id, admin.id);
    if (closed) {
      revalidatePath("/", "layout");
      return { success: `Статус обновлён. Несыгранные матчи отменены: ${closed}, серверы освобождены.` };
    }
  }

  if (status === "checkin") {
    await enqueuePrefetch(id, admin.id);
    const { data } = await db()
      .from("tournament_registrations")
      .select("team:teams(captain_id)")
      .eq("tournament_id", id)
      .eq("status", "approved");
    const captains = ((data ?? []) as unknown as { team: { captain_id: string } }[]).map((r) => r.team.captain_id);
    await notify(captains, `Check-in на «${before.name}» открыт`, "Подтвердите участие команды.", `/tournaments/${before.slug}/checkin`);
  }

  revalidatePath("/", "layout");
  return { success: "Статус обновлён" };
}

export async function deleteTournament(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const t = await getTournamentById(id);
  if (!t) return { error: "Турнир не найден" };
  if (t.status !== "draft" && String(formData.get("confirm") ?? "").trim() !== t.name.trim()) {
    return { error: "Введите точное название турнира, чтобы подтвердить удаление" };
  }

  // матчи турнира, которые сейчас на серверах, — снимаем с серверов, чтобы освободить инстансы
  const { data: onServers } = await db()
    .from("matches")
    .select("id, server_instance")
    .eq("tournament_id", id)
    .not("server_instance", "is", null)
    .in("status", ["ready", "live", "veto", "upcoming"]);
  for (const m of onServers ?? []) {
    await enqueueCommand(m.server_instance, "end_match", {}, admin.id);
  }

  // матчи, сетка, заявки, вето, статистика и споры удаляются каскадом
  const { error } = await db().from("tournaments").delete().eq("id", id);
  if (error) return { error: `Не удалось удалить: ${error.message}` };
  await audit(admin.id, "tournament.delete", { type: "tournament", id }, { name: t.name, status: t.status });
  revalidatePath("/", "layout");
  redirect("/admin/tournaments");
}

export async function decideRegistration(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("registrationId"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;

  const { data: reg } = await db()
    .from("tournament_registrations")
    .select("*, team:teams(*), tournament:tournaments(*)")
    .eq("id", id)
    .single();
  if (!reg) return { error: "Заявка не найдена" };

  const now = new Date().toISOString();
  let status: string;
  if (decision === "approve") {
    if ((await countApproved(reg.tournament_id)) >= reg.tournament.max_teams) {
      return { error: `Уже одобрено максимальное количество команд (${reg.tournament.max_teams})` };
    }
    status = "approved";
  } else if (decision === "reject") {
    status = "rejected";
  } else if (decision === "pending") {
    status = "pending";
  } else if (decision === "withdraw") {
    status = "withdrawn";
  } else {
    return { error: "Неизвестное действие" };
  }

  await db()
    .from("tournament_registrations")
    .update({
      status,
      note,
      decided_by: admin.id,
      decided_at: now,
      ...(status !== "approved" && { checked_in_at: null }),
    })
    .eq("id", id);
  if (status === "rejected" || status === "withdrawn") {
    await db().from("tournament_roster_players").delete().eq("registration_id", id);
  }

  const titles: Record<string, string> = {
    approved: `Заявка ${reg.team.name} на «${reg.tournament.name}» одобрена`,
    rejected: `Заявка ${reg.team.name} на «${reg.tournament.name}» отклонена`,
    withdrawn: `Заявка ${reg.team.name} на «${reg.tournament.name}» снята администратором`,
    pending: `Заявка ${reg.team.name} возвращена на рассмотрение`,
  };
  await notify([reg.team.captain_id], titles[status], note ?? undefined, `/tournaments/${reg.tournament.slug}`);
  await audit(admin.id, `registration.${status}`, { type: "registration", id }, { team: reg.team.tag, note });
  revalidatePath(`/admin/tournaments/${reg.tournament_id}`);
  revalidatePath(`/tournaments/${reg.tournament.slug}`);
  return null;
}

export async function adminCheckIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("registrationId"));
  const undo = formData.get("undo") === "1";
  await db()
    .from("tournament_registrations")
    .update(undo ? { checked_in_at: null, checked_in_by: null } : { checked_in_at: new Date().toISOString(), checked_in_by: admin.id })
    .eq("id", id)
    .eq("status", "approved");
  await audit(admin.id, undo ? "registration.checkin_undo" : "registration.checkin_admin", { type: "registration", id });
  revalidatePath("/admin/tournaments", "layout");
  return null;
}

export async function setSeed(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("registrationId"));
  const raw = String(formData.get("seed") ?? "").trim();
  const seed = raw ? Number(raw) : null;
  if (seed !== null && (!Number.isInteger(seed) || seed < 1 || seed > 64)) return { error: "Seed — число от 1 до 64" };
  await db().from("tournament_registrations").update({ seed }).eq("id", id);
  await audit(admin.id, "registration.seed", { type: "registration", id }, { seed });
  revalidatePath("/admin/tournaments", "layout");
  return null;
}

export async function adminRemoveRosterPlayer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const rosterId = String(formData.get("rosterId"));
  const { data: row } = await db()
    .from("tournament_roster_players")
    .select("*, player:players(steam_id, nickname)")
    .eq("id", rosterId)
    .single();
  if (!row) return { error: "Игрок не найден в составе" };
  await db().from("tournament_roster_players").delete().eq("id", rosterId);
  await audit(admin.id, "roster.remove", { type: "registration", id: row.registration_id }, { player: row.player.steam_id });
  revalidatePath("/admin/tournaments", "layout");
  return { success: `${row.player.nickname} убран из состава` };
}

export async function adminAddRosterPlayer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const registrationId = String(formData.get("registrationId"));
  const steamId = String(formData.get("steamId") ?? "").trim();
  const role = formData.get("role") === "sub" ? "sub" : "main";
  if (!/^\d{17}$/.test(steamId)) return { error: "SteamID64 — 17 цифр" };

  const player = await getPlayerBySteamId(steamId);
  if (!player) return { error: "Игрок с таким SteamID ещё не входил на платформу" };

  const { data: reg } = await db().from("tournament_registrations").select("tournament_id").eq("id", registrationId).single();
  if (!reg) return { error: "Заявка не найдена" };

  const { error } = await db()
    .from("tournament_roster_players")
    .insert({ registration_id: registrationId, tournament_id: reg.tournament_id, player_id: player.id, role });
  if (error) return { error: "Игрок уже заявлен на этот турнир" };
  await audit(admin.id, "roster.add", { type: "registration", id: registrationId }, { player: steamId, role });
  revalidatePath("/admin/tournaments", "layout");
  return { success: `${player.nickname} добавлен в состав` };
}

export async function togglePlayerFlag(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const playerId = String(formData.get("playerId"));
  const flag = String(formData.get("flag"));
  if (flag !== "is_banned" && flag !== "is_admin") return { error: "Неизвестный флаг" };
  if (playerId === admin.id) return { error: "Нельзя менять собственные права" };

  const { data: p } = await db().from("players").select(`steam_id, ${flag}`).eq("id", playerId).single();
  if (!p) return { error: "Игрок не найден" };
  const value = !(p as unknown as Record<string, boolean>)[flag];
  await db().from("players").update({ [flag]: value }).eq("id", playerId);
  await audit(admin.id, `player.${flag}`, { type: "player", id: playerId }, { steam_id: p.steam_id, value });
  revalidatePath("/admin/players");
  return null;
}
