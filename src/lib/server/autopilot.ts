import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { AWARDS_TAG } from "../awards";
import { FORMATS, type FormatKind } from "../formats";
import { notify } from "../audit";
import { assignLobbyServers } from "../lobby";
import { getMaxParallelMatches, getPlayInFirst, getRoundStrict } from "../settings";
import { db } from "../supabase";
import type { Match } from "../types";
import { enqueueCommand, getServerState, hostBusy } from "./state";
import { recentlyFreed } from "./freeing";
import { enqueueAutoPrefetch, workshopInfo } from "./workshop";
import { announceCalls, callMatch, hallConfig, hallSnapshot, rested } from "../hall";

// ───────────────────────── назначение сервера

/** Свободный инстанс: агент его видит запущенным, MatchZy без матча, и он не закреплён за другим матчем */
export async function pickFreeInstance(preferRole: "active" | "reserve" = "active", opts: { waitFreeing?: boolean } = {}) {
  const { online, instances, host } = await getServerState();
  if (!online) return null;
  // агент занят обслуживанием всего хоста (обновление) — серверы могут перезапускаться, не назначаем.
  // Прогрев карт занимает только свой инстанс (busy_instances) — остальные свободны.
  const busyNow = hostBusy(host);
  if (busyNow.host) return null;
  const [{ data: busy }, { data: lobbyBusy }] = await Promise.all([
    db().from("matches").select("server_instance").not("server_instance", "is", null).in("status", ["ready", "live"]),
    db().from("lobby_games").select("server_instance").not("server_instance", "is", null).in("status", ["waiting", "live"]),
  ]);
  const taken = new Set([...(busy ?? []), ...(lobbyBusy ?? [])].map((b) => b.server_instance));
  // серверы лобби турнирам не отдаём
  const free = instances.filter((i) => !i.for_lobby && i.running && (i.gamestate ?? "none") === "none" && !taken.has(i.name) && !busyNow.instances.has(i.name));
  const pick = free.find((i) => i.role === preferRole) ?? free[0] ?? null;
  // сервер с меньшим номером только что отпустили — ждём его (до 90 с), а не занимаем следующий
  const freeing = instances.filter((i) => !i.for_lobby && i.running && (i.gamestate ?? "none") !== "none" && !taken.has(i.name) && (!pick || i.name < pick.name));
  if (opts.waitFreeing !== false && freeing.length && (await recentlyFreed(freeing.map((i) => i.name))).size) return null;
  return pick;
}

export async function assignServer(match: Match, instanceName: string, actorId?: string) {
  const { data, error } = await db().rpc("assign_game_server", {
    p_game: match.id, p_instance: instanceName, p_actor: actorId, // не передан → DEFAULT null
  });
  if (error) throw new Error("Не удалось назначить сервер", { cause: error });
  return data === true;
}

/** Турнирные матчи в клубе (LAN), которые сейчас занимают сервер и места в зале: идут или назначены и грузятся. Онлайн-матчи мест не занимают */
export async function matchesOnServers() {
  const { data } = await db()
    .from("matches")
    .select("status, server_state, tournament:tournaments!inner(is_lan)")
    .eq("tournament.is_lan", true)
    .not("server_instance", "is", null)
    .in("status", ["ready", "live"]);
  return (data ?? []).filter((m) => m.status === "live" || m.server_state !== "error").length;
}

// ───────────────────────── автопилот

const AUTOPILOT_LEAD_MS = 10 * 60_000; // матч с расписанием уходит на сервер за 10 минут до начала

/**
 * Автопилот: для турниров с включённым автопилотом запускает вето у матчей с известными соперниками
 * и отправляет готовые матчи на свободные серверы. Вызывается на каждой синхронизации агента.
 */
export async function autopilotTick() {
  const { data: ts } = await db()
    .from("tournaments")
    .select("id, map_pool, is_lan, bracket_type")
    .eq("autopilot", true)
    .in("status", ["checkin", "live"]);
  if (!ts?.length) return;
  const seIds = ts.filter((t) => t.bracket_type === "single_elimination").map((t) => t.id);
  const [playInFirst, roundStrict] = await Promise.all([getPlayInFirst(seIds), getRoundStrict(seIds)]);

  const now = Date.now();
  const due = (m: { scheduled_at: string | null }) => !m.scheduled_at || new Date(m.scheduled_at).getTime() - now <= AUTOPILOT_LEAD_MS;
  // места в зале: не больше MAX_PARALLEL_MATCHES матчей на серверах сразу (по всем LAN-турнирам — зал один).
  // Онлайн-турниры игроки играют из дома — их матчи мест не занимают, их ограничивает только число серверов
  const limit = await getMaxParallelMatches();
  let seats = limit == null ? Infinity : limit - (await matchesOnServers());
  const hall = ts.some((t) => t.is_lan) ? await hallConfig() : null;

  for (const t of ts) {
    const { data: list } = await db()
      .from("matches")
      .select("id, number, bracket, round, stage, status, scheduled_at, server_instance, server_state, team1_id, team2_id")
      .eq("tournament_id", t.id)
      .in("status", ["upcoming", "veto", "ready", "live"])
      .order("number");
    const matches = (list ?? []).sort(
      (a, b) =>
        (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999") || a.round - b.round || a.number - b.number,
    );
    const stageIds = new Set(matches.filter((m) => m.stage === "group" || m.stage === "swiss").map((m) => m.id));
    // участник не может играть два матча одновременно: занят, если его матч уже на сервере или идёт
    const busy = new Set<string>();
    for (const m of matches) {
      if (m.status === "live" || (m.status === "ready" && m.server_instance && m.server_state !== "error")) {
        if (m.team1_id) busy.add(m.team1_id);
        if (m.team2_id) busy.add(m.team2_id);
      }
    }
    // группы / круговая / швейцарка — строго по турам: следующий тур, когда весь текущий сыгран
    const { data: openStage } = await db()
      .from("matches")
      .select("round, stage")
      .eq("tournament_id", t.id)
      .in("stage", ["group", "swiss"])
      .not("status", "in", "(finished,cancelled)");
    const currentRound = openStage?.length ? Math.min(...openStage.map((x) => x.round)) : null;
    // «Сначала отборочные»: пока не сыграны все матчи первого раунда олимпийки, следующие раунды ждут
    const playInPending = playInFirst.has(t.id) && matches.some((x) => x.bracket === "upper" && x.round === 1);
    // «Строго по раундам»: раунд начинается, когда весь предыдущий сыгран; финал — после матча за 3-е место
    const strict = roundStrict.has(t.id);
    const finalRound = Math.max(0, ...matches.filter((x) => x.bracket === "upper").map((x) => x.round));
    const strictWaits = (m: { bracket: string; round: number }) =>
      strict &&
      (matches.some((x) => x.bracket === "upper" && x.round < m.round) ||
        (m.bracket === "upper" && m.round === finalRound && matches.some((x) => x.bracket === "third_place")));
    const free = (m: { team1_id: string | null; team2_id: string | null; round: number; id: string; bracket: string }) =>
      !!m.team1_id &&
      !!m.team2_id &&
      !busy.has(m.team1_id) &&
      !busy.has(m.team2_id) &&
      (!playInPending || m.round === 1) &&
      !strictWaits(m) &&
      (currentRound == null || !stageIds.has(m.id) || m.round === currentRound);

    // 1а. LAN с рассадкой: матч не начинает вето сам — его вызывают на места (бот пишет в Telegram, где садиться),
    // а бан-пик начинается после «Готов» обоих капитанов или через 10 минут (hallTick)
    if (t.is_lan && hall?.enabled) {
      const waiting = matches.filter((x) => x.status === "upcoming" && x.team1_id && x.team2_id && due(x) && free(x));
      if (waiting.length) {
        const snap = await hallSnapshot(t.id, hall);
        const called: Exclude<Awaited<ReturnType<typeof callMatch>>, string>[] = [];
        // «Турнирных матчей одновременно» — считаем и вызванные на места, не только идущие на серверах
        let inHall = snap.matches.filter((x) => ["veto", "ready", "live"].includes(x.status) || (x.status === "upcoming" && snap.calls.has(x.id))).length;
        for (const m of waiting) {
          if (snap.calls.has(m.id)) continue; // уже вызван — ждём «Готов»
          if (limit != null && inHall >= limit) break;
          if (!rested(snap.matches, m.team1_id!, now, snap.restMs) || !rested(snap.matches, m.team2_id!, now, snap.restMs)) continue; // перерыв между матчами
          const r = await callMatch(m.id, { announce: false });
          if (typeof r === "string") {
            if (r.startsWith("Свободных мест нет")) break; // мест нет — следующий матч тоже не сядет
            continue;
          }
          called.push(r);
          inHall++;
        }
        await announceCalls(called);
      }
    }

    // 1. вето — как только соперники известны (без рассадки)
    for (const m of matches.filter((x) => !(t.is_lan && hall?.enabled) && x.status === "upcoming" && x.team1_id && x.team2_id && due(x) && free(x))) {
      const { data: updated } = await db()
        .from("matches")
        .update({ status: "veto", veto_deadline: new Date(now + 60_000).toISOString() })
        .eq("id", m.id)
        .eq("status", "upcoming")
        .select("id");
      if (!updated?.length) continue;
      const { data: teams } = await db().from("teams").select("captain_id").in("id", [m.team1_id, m.team2_id].filter((id): id is string => !!id));
      await notify(
        (teams ?? []).map((x) => x.captain_id),
        `Вето матча #${m.number} началось`,
        "Автопилот: на каждый шаг — 60 секунд.",
        `/matches/${m.id}`,
      );
    }

    // 2. готовые матчи — на свободные серверы
    for (const m of matches.filter((x) => x.status === "ready" && (!x.server_instance || x.server_state === "error") && due(x))) {
      if (!free(m)) continue; // кто-то из участников ещё доигрывает другой матч
      if (t.is_lan && seats <= 0) continue; // зал занят — матч уйдёт, когда закончится один из идущих (онлайн это не касается)
      if (await workshopLoadBusy(m.id)) continue; // другой сервер сейчас качает/грузит карту — по одному
      const inst = await pickFreeInstance();
      if (!inst) return; // свободных серверов нет — ждём следующей синхронизации
      busy.add(m.team1_id!);
      busy.add(m.team2_id!);
      const { data: full } = await db().from("matches").select("*").eq("id", m.id).single();
      if (!full) continue;
      if (!(await assignServer(full as Match, inst.name))) continue;
      if (t.is_lan) seats--;
      await db()
        .from("audit_logs")
        .insert({ action: "autopilot.assign", entity_type: "match", entity_id: m.id, payload: { instance: inst.name } });
    }
  }
}

/** Workshop-карты турнира (формат «name@id») → прогрев на сервере, чтобы к матчу карта уже была в кэше */
export async function enqueuePrefetch(tournamentId: string, actorId?: string) {
  const { data: t } = await db().from("tournaments").select("map_pool").eq("id", tournamentId).single();
  const ids = ((t?.map_pool ?? []) as string[]).filter((m) => m.includes("@")).map((m) => m.split("@")[1]);
  if (!ids.length) return 0;
  await enqueueCommand(null, "prefetch_maps", { workshop_ids: ids }, actorId);
  return ids.length;
}

/**
 * Проверка перед турниром: активные инстансы и Workshop-карты турниров, которые ещё не прошли.
 * Агент сам запускает выключенные инстансы, проверяет и возвращает их в прежнее состояние.
 */
export async function enqueueSelfCheck(actorId?: string) {
  const [{ data: insts }, { data: ts }] = await Promise.all([
    db().from("server_instances").select("name, role").order("name"),
    db().from("tournaments").select("map_pool").not("status", "in", "(finished,cancelled)"),
  ]);
  const instances = (insts ?? []).filter((i) => i.role === "active").map((i) => i.name);
  const workshop = [
    ...new Set(((ts ?? []) as { map_pool: string[] }[]).flatMap((t) => (t.map_pool ?? []).filter((m) => m.includes("@")).map((m) => m.split("@")[1]))),
  ];
  await enqueueCommand(null, "self_check", { instances, workshop_ids: workshop }, actorId);
}

/**
 * Матч с Workshop-картой ждёт, если:
 *  - карта ещё не прогрета/не подтверждена прогревом (загрузка через матч без кэша роняет сервер) —
 *    прогрев запустит verifyWorkshopLibrary / enqueuePrefetch, матч уйдёт после подтверждения;
 *  - другой матч сейчас грузится: все инстансы делят одну папку steamapps, загружаем по одному.
 */
async function workshopLoadBusy(matchId: string) {
  const { data: maps } = await db().from("match_maps").select("map_name").eq("match_id", matchId).order("map_number");
  return workshopBusyFor((maps ?? []).map((m) => m.map_name), matchId);
}

/** То же для любого набора карт; selfId — матч или игра лобби, которую не считаем «другой загрузкой» */
export async function workshopBusyFor(mapNames: string[], selfId: string) {
  const ws = mapNames.filter((n) => n.includes("@"));
  if (!ws.length) return false;
  const info = await workshopInfo();
  const unverified = ws.map((n) => n.split("@")[1]).filter((id) => !info[id]?.ok);
  if (unverified.length) {
    // карт турнира может не быть в библиотеке — прогреваем их напрямую (не поверх идущего прогрева)
    await enqueueAutoPrefetch(unverified);
    return true;
  }
  const [{ count }, { count: lobbyLoading }] = await Promise.all([
    db().from("matches").select("id", { count: "exact", head: true }).eq("server_state", "loading").neq("id", selfId),
    db().from("lobby_games").select("id", { count: "exact", head: true }).eq("server_state", "loading").neq("id", selfId),
  ]);
  return !!count || !!lobbyLoading;
}

/** Игры лобби, ждущие сервер, → на свободные серверы лобби (на каждой синхронизации агента) */
export async function lobbyServersTick() {
  await assignLobbyServers({ workshopBusy: workshopBusyFor });
}

// ───────────────────────── автозавершение турнира

/**
 * Все матчи сетки сыграны (финал и матч за 3-е место тоже) — турнир сам переходит в «Завершён»: итоги, награды,
 * серверы снова доступны лобби. Без админа. Не трогает: турниры без сетки, двухэтапные форматы до плей-офф,
 * матчи на проверке судей (under_review).
 */
export async function finishCompletedTournaments() {
  const { data: ts } = await db()
    .from("tournaments")
    .select("id, slug, status, bracket_type, bracket_published_at, playoff_created_at")
    .in("status", ["checkin", "live"])
    .not("bracket_published_at", "is", null);
  let finished = 0;
  for (const t of ts ?? []) {
    if (FORMATS[t.bracket_type as FormatKind]?.playoff && !t.playoff_created_at) continue;
    const { data: ms } = await db().from("matches").select("status, under_review").eq("tournament_id", t.id);
    if (!ms?.length || ms.some((m) => !["finished", "cancelled"].includes(m.status) || m.under_review)) continue;
    if (!ms.some((m) => m.status === "finished")) continue;
    const { data: done } = await db()
      .from("tournaments")
      .update({ status: "finished", updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("status", t.status)
      .select("id");
    if (!done?.length) continue;
    await db().from("audit_logs").insert({ action: "tournament.status", entity_type: "tournament", entity_id: t.id, payload: { from: t.status, to: "finished", auto: true } });
    try {
      for (const path of ["/", "/tournaments", "/matches", "/stats", "/tv"]) revalidatePath(path);
      for (const sub of ["", "/recap", "/tv"]) revalidatePath(`/tournaments/${t.slug}${sub}`);
      revalidatePath("/players/[steamId]", "page");
      revalidatePath("/teams/[tag]", "page");
      revalidateTag(AWARDS_TAG, "max");
    } catch {
      // вне запроса Next (скрипты, тесты) кэша страниц нет — нечего сбрасывать
    }
    finished++;
  }
  return finished;
}

// ───────────────────────── закрытие матчей завершённого турнира

/**
 * Турнир завершён или отменён → его несыгранные матчи отменяются, серверы освобождаются.
 * Вызывается при смене статуса и на каждом тике агента (подчищает старые данные).
 */
export async function closeMatchesOfEndedTournaments(tournamentId?: string, actorId?: string) {
  let q = db().from("tournaments").select("id").in("status", ["finished", "cancelled"]);
  if (tournamentId) q = q.eq("id", tournamentId);
  const { data: ts } = await q;
  const ids = (ts ?? []).map((t) => t.id);
  if (!ids.length) return 0;

  const { data: open } = await db()
    .from("matches")
    .select("id, server_instance")
    .in("tournament_id", ids)
    .in("status", ["pending", "upcoming", "veto", "ready", "live"]);
  if (!open?.length) return 0;

  for (const m of open) {
    if (m.server_instance) await enqueueCommand(m.server_instance, "end_match", {}, actorId);
  }
  await db()
    .from("matches")
    .update({ status: "cancelled", server_instance: null, server_state: null, server_address: null, server_password: null })
    .in(
      "id",
      open.map((m) => m.id),
    );
  await db()
    .from("audit_logs")
    .insert({ action: "tournament.close_matches", entity_type: "tournament", entity_id: ids[0], payload: { matches: open.length } });
  return open.length;
}
