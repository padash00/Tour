import "server-only";
import { db } from "./supabase";
import { getMapImages } from "./settings";
import { getT } from "./i18n/server";
import { tr, type T } from "./i18n/core";
import {
  captainsOf,
  checkHostAway,
  getGame,
  getLobbyByCode,
  getMembers,
  isOnline,
  lobbyHasDue,
  lobbyTimeouts,
  lobbyTurn,
  sidesByPick,
  vetoUntimed,
  type GameMap,
  type GameTeam,
  type GameVeto,
  teamSlotsOf,
  type Lobby,
  type Slot,
  type TeamSlot,
} from "./lobby";
import { cupTeams, roundTitle, standings, teamOut, type Cup, type CupMatch } from "./cup-core";
import type { LobbySettings } from "./lobby-settings";
import { tierOf, type TierKey } from "./tiers";
import type { Player } from "./types";
import { voiceOnline } from "./voice";
import { twentyBriefs, vetoEdge, type TwentyBrief } from "./twenty";
import { playerStrength, teamBalance, type Balance, type RoleKey } from "./twenty-core";

/** Как часто обновлять last_seen_at зрителя (мс) — с запасом меньше ONLINE_MS */
const SEEN_WRITE_MS = 10_000;

export type ViewMember = {
  id: string;
  steam_id: string;
  nickname: string;
  avatar_url: string | null;
  faceit_level: number | null;
  faceit_elo: number | null;
  slot: Slot;
  ready: boolean;
  online: boolean;
  /** на сервере TeamSpeak клуба с привязкой к профилю — бот переведёт его в комнату команды */
  voice: boolean;
  /** «Десятка»: тир по ELO (null — не «Десятка» или рейтинга нет) и отметка организатора о взносе */
  tier: TierKey | null;
  paid: boolean;
  /** «Микс»: рейтинг, роль и коронная карта игрока — подсказка капитанам при разборе (null — в «Миксе» не играл) */
  mix: { rating: number; maps: number; wins: number; matches: number; kd: number; adr: number; hsPct: number; role: RoleKey | null; best: { map: string; rating: number } | null } | null;
};

export type ViewGame = {
  id: string;
  status: "veto" | "waiting" | "live" | "finished" | "cancelled";
  best_of: number;
  team1: GameTeam;
  team2: GameTeam;
  maps: GameMap[];
  veto: GameVeto[];
  veto_pool: string[];
  veto_deadline: string | null;
  veto_turn: 1 | 2 | null;
  /** side — капитан выбирает сторону на карте side_map, которую только что пикнул соперник */
  veto_action: "ban" | "pick" | "side" | null;
  side_map: string | null;
  /** стороны «по пикам»: под картами серии показываем, кто за кого начинает */
  sides_by_pick: boolean;
  /** вето: средний рейтинг каждой команды на картах пула по играм «Микса» (null — данных нет ни по одной карте) */
  map_edge: Record<string, { team1: { rating: number; known: number } | null; team2: { rating: number; known: number } | null }> | null;
  team1_score: number;
  team2_score: number;
  winner: 1 | 2 | null;
  server_state: string | null;
  /** адрес — только участникам игры, наблюдателям лобби и админам */
  server_address: string | null;
  gotv_address: string | null;
  note: string | null;
  network: "lan" | "internet";
  finished_at: string | null;
};

export type LobbyView = {
  access: "ok" | "password" | "closed_lobby";
  now: string;
  me: { id: string; slot: Slot | null; isHost: boolean; isAdmin: boolean; inGame: boolean } | null;
  lobby: {
    id: string;
    code: string;
    visibility: Lobby["visibility"];
    status: Lobby["status"];
    settings: LobbySettings;
    team1_name: string;
    team2_name: string;
    bots: Lobby["bots"];
    host_id: string;
    host_name: string;
    ready_check_until: string | null;
    draft: Lobby["draft"];
    invite_token: string | null;
    has_password: boolean;
    created_at: string;
  };
  captains: (string | null)[];
  /** сравнение двух составов по рейтингу в «Миксе» (null — команд больше двух или игроков пока мало) */
  balance: Balance | null;
  /** команды лобби по порядку: две или столько, на сколько игроков оно создано */
  teams: { slot: TeamSlot; name: string }[];
  /** лобби на несколько команд: сетка или круг матчей (null — обычное лобби или матчи ещё не начинались) */
  cup: ViewCup | null;
  members: ViewMember[];
  bans: { id: string; nickname: string }[];
  messages: { id: number; player_id: string | null; nickname: string | null; avatar_url: string | null; body: string; created_at: string }[];
  game: ViewGame | null;
  history: { id: string; team1: string; team2: string; team1_score: number; team2_score: number; winner: 1 | 2 | null; maps: string[]; finished_at: string | null }[];
  mapImages: Record<string, string>;
};

export type ViewCup = {
  format: Cup["format"];
  state: Cup["state"];
  names: string[];
  champion: number | null;
  rounds: { round: number; title: string; matches: (Pick<CupMatch, "id" | "a" | "b" | "state" | "winner" | "score"> & { code: string | null; mine: boolean; maps: CupMapScore[] })[] }[];
  /** таблица круговой */
  table: import("./cup-core").CupRow[] | null;
  /** комната матча, в котором сейчас играет зритель */
  myRoom: string | null;
  /** команда зрителя выбыла из сетки: он может выйти из лобби или открыть другое */
  out: boolean;
};

/** Карта матча сетки: счёт по раундам (a — первая команда матча); live — карта идёт сейчас */
export type CupMapScore = { map: string; a: number; b: number; live: boolean };

/**
 * Счёт по картам матчей сетки — из игр их комнат (один запрос на все комнаты). В комнате команда a — team1.
 * У перезапущенного матча берём последнюю неотменённую игру. Ключ — код комнаты.
 */
async function cupMapScores(lobby: Lobby): Promise<Map<string, CupMapScore[]>> {
  const out = new Map<string, CupMapScore[]>();
  const cup = lobby.bracket as Cup | null;
  const codes = (cup?.matches ?? []).filter((m) => m.code && (m.state === "playing" || m.state === "done")).map((m) => m.code!);
  if (!codes.length) return out;
  const { data } = await db().from("lobbies").select("code, games:lobby_games!lobby_games_lobby_id_fkey(status, maps, created_at)").in("code", codes);
  for (const room of data ?? []) {
    const games = ((room.games ?? []) as unknown as { status: string; maps: GameMap[] | null; created_at: string }[])
      .filter((g) => g.status !== "cancelled")
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    const maps = (games[0]?.maps ?? []).filter((m) => m.status !== "pending");
    out.set(room.code, maps.map((m) => ({ map: m.map, a: m.team1_score, b: m.team2_score, live: m.status === "live" })));
  }
  return out;
}

function viewCup(lobby: Lobby, viewerId: string | null, canOpen: boolean, mapScores: Map<string, CupMapScore[]>): ViewCup | null {
  const cup = lobby.bracket as Cup | null;
  if (!cup || !cup.matches?.length) return null;
  const team = viewerId ? cup.rosters.findIndex((r) => r.includes(viewerId)) : -1;
  const rounds = [...new Set(cup.matches.map((m) => m.round))].sort((a, b) => a - b);
  let myRoom: string | null = null;
  const view = rounds.map((round) => ({
    round,
    title: roundTitle(cup, round),
    matches: cup.matches
      .filter((m) => m.round === round)
      .map((m) => {
        const mine = team >= 0 && (m.a === team || m.b === team);
        if (mine && m.state === "playing" && m.code) myRoom = m.code;
        // комнату матча открывают его игроки, организатор и админ
        const maps = (m.code && mapScores.get(m.code)) || [];
        // идущий матч: счёт серии — по уже сыгранным картам
        const played = maps.filter((x) => !x.live);
        const score = m.score ?? (m.state === "playing" && maps.length ? ([played.filter((x) => x.a > x.b).length, played.filter((x) => x.b > x.a).length] as [number, number]) : null);
        return { id: m.id, a: m.a, b: m.b, state: m.state, winner: m.winner, score, maps, code: m.state === "playing" && (mine || canOpen) ? m.code : null, mine };
      }),
  }));
  return { format: cup.format, state: cup.state, names: cup.names, champion: cup.champion, rounds: view, table: cup.format === "round" ? standings(cup) : null, myRoom, out: teamOut(cup, team) };
}

/** Служебные пометки игры хранятся по-русски; игроку показываем на его языке (динамические — по шаблону) */
const NOTES = [
  tr("ждём свободный сервер"),
  tr("лобби закрыто"),
  tr("ищем другой сервер"),
  tr("карта из мастерской прогревается на сервере…"),
  tr("все серверы для лобби заняты — ждём, когда освободится"),
  tr("агент серверного ПК не на связи"),
  tr("идёт обслуживание серверов"),
  tr("идёт турнир — серверы отданы турниру, лобби запустится после него"),
  tr("матч снят с сервера"),
  tr("за 20 минут матч так и не начался"),
] as const;
function noteText(note: string | null, t: T) {
  if (!note) return note;
  if ((NOTES as readonly string[]).includes(note)) return t(note);
  const m = /^запускаем сервер (.+)…$/.exec(note);
  return m ? t("запускаем сервер {name}…", { name: m[1] }) : note;
}

/**
 * Состояние лобби для страницы. Заодно: отмечает зрителя «в сети», применяет истёкшие таймеры
 * (драфт, проверка готовности, вето) и передаёт хоста, если он давно не заходил.
 */
export async function buildLobbyView(code: string, viewer: Player | null, opts: { admin: boolean }): Promise<LobbyView | null> {
  const t = await getT();
  let lobby = await getLobbyByCode(code);
  if (!lobby) return null;

  // зритель — участник: отмечаем, что он на странице. Пишем не чаще раза в SEEN_WRITE_MS
  // (страница опрашивает каждые 1,5 с, а «в сети» — это 45 с), параллельно с чтением игры
  const seen = viewer
    ? db()
        .from("lobby_members")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("lobby_id", lobby.id)
        .eq("player_id", viewer.id)
        .lt("last_seen_at", new Date(Date.now() - SEEN_WRITE_MS).toISOString())
    : null;
  let [game] = await Promise.all([lobby.current_game_id ? getGame(lobby.current_game_id) : null, seen]);
  if (lobbyHasDue(lobby, game)) {
    await lobbyTimeouts(lobby);
    lobby = (await getLobbyByCode(code))!;
    game = lobby.current_game_id ? await getGame(lobby.current_game_id) : null;
  }

  let members = await getMembers(lobby.id);
  // перечитываем лобби, только если хост действительно сменился
  if (lobby.status !== "closed" && members.length && (await checkHostAway(lobby, members))) {
    const fresh = await getLobbyByCode(code);
    if (fresh) {
      lobby = fresh;
      members = await getMembers(lobby.id);
    }
  }

  const mine = viewer ? members.find((m) => m.player_id === viewer.id) : undefined;
  const isHost = !!viewer && lobby.host_id === viewer.id;
  // закрытое и приватное лобби постороннему — только экран входа (пароль или ссылка-приглашение)
  // организатор большого лобби — хост и в комнатах матчей, хотя сам в них может не играть
  const access: LobbyView["access"] =
    lobby.status === "closed" && !mine && !opts.admin ? "closed_lobby" : mine || isHost || opts.admin || lobby.visibility === "public" ? "ok" : "password";
  // приватное лобби постороннему без ссылки-приглашения не показываем вовсе
  const hidden = access !== "ok" && lobby.visibility === "private";
  const inGame = !!viewer && !!game && [...game.team1.players, ...game.team2.players].some((p) => p.id === viewer.id);
  const seesAddress = opts.admin || inGame || mine?.slot === "spec";

  // подсказки из «Микса» — из кэша; если он недоступен, комната работает без них
  const mixLoad = hidden ? Promise.resolve({ players: {} as Record<string, TwentyBrief>, fit: null }) : twentyBriefs().catch(() => ({ players: {} as Record<string, TwentyBrief>, fit: null }));
  const [inVoice, { data: msgs }, { data: bans }, { data: past }, mapImages, mixData] = await Promise.all([
    hidden ? new Set<string>() : voiceOnline(members.map((m) => m.player_id)),
    access === "ok"
      ? db()
          .from("lobby_messages")
          .select("id, player_id, body, created_at, player:players(nickname, avatar_url)")
          .eq("lobby_id", lobby.id)
          .order("id", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] }),
    isHost || opts.admin
      ? db().from("lobby_bans").select("player:players(id, nickname)").eq("lobby_id", lobby.id)
      : Promise.resolve({ data: [] }),
    access === "ok"
      ? db()
          .from("lobby_games")
          .select("id, team1, team2, team1_score, team2_score, winner, maps, finished_at")
          .eq("lobby_id", lobby.id)
          .eq("status", "finished")
          .order("finished_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    getMapImages(),
    mixLoad,
  ]);
  const briefs = mixData.players;
  // игроку в комнате — его цифры из «Микса» без рейтинга по всем картам (тот нужен только для вето)
  const mixOf = (b: TwentyBrief | undefined): ViewMember["mix"] => (b ? { rating: b.rating, maps: b.maps, wins: b.wins, matches: b.matches, kd: b.kd, adr: b.adr, hsPct: b.hsPct, role: b.role, best: b.best } : null);
  // баланс составов: только когда команд две; сила — рейтинг в «Миксе», у новичков — оценка по ELO
  const strengthOf = (slot: Slot) =>
    members
      .filter((m) => m.slot === slot)
      .map((m) => playerStrength(briefs[m.player.steam_id] ?? null, (lobby!.settings.pot ? lobby!.settings.pot_elo[m.player_id] : null) ?? m.player.faceit_elo ?? null, mixData.fit));
  const balance = hidden || teamSlotsOf(lobby.settings).length !== 2 ? null : teamBalance(strengthOf("team1"), strengthOf("team2"));

  const host = members.find((m) => m.player_id === lobby.host_id);
  let gotv: string | null = null;
  if (game?.server_address && game.settings.gotv) {
    const [ip, port] = game.server_address.split(":");
    gotv = `${ip}:${Number(port) + 5}`;
  }
  const turn = game?.status === "veto" ? lobbyTurn(game) : null;
  let mapEdge: ViewGame["map_edge"] = null;
  if (game?.status === "veto" && game.veto_pool.length) {
    const edge = vetoEdge(briefs, game.team1.players.map((p) => p.steam_id), game.team2.players.map((p) => p.steam_id), game.veto_pool);
    if (Object.values(edge).some((e) => e.team1 || e.team2)) mapEdge = edge;
  }

  return {
    access,
    now: new Date().toISOString(),
    me: viewer ? { id: viewer.id, slot: mine?.slot ?? null, isHost, isAdmin: opts.admin, inGame } : null,
    lobby: {
      id: lobby.id,
      code: lobby.code,
      visibility: lobby.visibility,
      status: lobby.status,
      settings: lobby.settings,
      team1_name: lobby.team1_name,
      team2_name: lobby.team2_name,
      bots: lobby.bots,
      host_id: lobby.host_id,
      host_name: host?.player.nickname ?? "—",
      ready_check_until: lobby.ready_check_until,
      draft: lobby.draft,
      // ссылкой-приглашением делятся участники
      invite_token: mine || opts.admin ? lobby.invite_token : null,
      has_password: !!lobby.password_hash,
      created_at: lobby.created_at,
    },
    captains: captainsOf(lobby, members),
    balance,
    teams: teamSlotsOf(lobby.settings).map((slot, i) => ({
      slot,
      name: cupTeams(lobby.settings.players) > 0 ? ((lobby.bracket as Cup | null)?.names?.[i] ?? `Команда ${i + 1}`) : i === 0 ? lobby.team1_name : lobby.team2_name,
    })),
    cup: access === "ok" ? viewCup(lobby, viewer?.id ?? null, isHost || opts.admin, await cupMapScores(lobby).catch(() => new Map())) : null,
    members: hidden
      ? []
      : members.map((m) => {
          const pot = lobby.settings.pot;
          // «Десятка»: ELO, с которым игрок допущен (зафиксированное на старте выбора), а не текущее из профиля
          const admitted = pot ? (lobby.settings.pot_elo[m.player_id] ?? null) : null;
          const elo = admitted ?? m.player.faceit_elo;
          return {
            id: m.player_id,
            steam_id: m.player.steam_id,
            nickname: m.player.nickname,
            avatar_url: m.player.avatar_url,
            faceit_level: m.player.faceit_level,
            faceit_elo: elo,
            slot: m.slot,
            ready: m.ready,
            online: isOnline(m),
            voice: inVoice.has(m.player_id),
            // допущенный игрок с ELO ниже 2200 — тир D: уровень уже проверен на входе; без рейтинга FACEIT — тоже D
            tier: !pot ? null : admitted ? (tierOf(admitted, 10) ?? "D") : !elo ? "D" : tierOf(elo, m.player.faceit_level),
            paid: pot && lobby.settings.pot_paid.includes(m.player_id),
            mix: mixOf(briefs[m.player.steam_id]),
          };
        }),
    bans: (bans ?? []).map((b) => b.player),
    messages: (msgs ?? [])
      .reverse()
      .map((m) => ({ id: m.id, player_id: m.player_id, nickname: m.player?.nickname ?? null, avatar_url: m.player?.avatar_url ?? null, body: m.body, created_at: m.created_at })),
    game:
      game && access === "ok"
        ? {
            id: game.id,
            status: game.status,
            best_of: game.best_of,
            team1: game.team1,
            team2: game.team2,
            maps: game.maps,
            veto: game.veto,
            veto_pool: game.veto_pool,
            // без ограничения по времени — срока нет, таймер в комнате не показывается
            veto_deadline: vetoUntimed(game) ? null : game.veto_deadline,
            veto_turn: turn?.team ?? null,
            veto_action: turn?.action ?? null,
            side_map: turn?.action === "side" ? turn.map : null,
            sides_by_pick: game.veto_pool.length > 0 && sidesByPick(game),
            map_edge: mapEdge,
            team1_score: game.team1_score,
            team2_score: game.team2_score,
            winner: game.winner,
            server_state: game.server_state,
            server_address: seesAddress && game.server_state === "ready" ? game.server_address : null,
            // GOTV раскрывает адрес сервера — только участникам лобби и админам
            gotv_address: game.server_state === "ready" && (!!mine || opts.admin) ? gotv : null,
            note: noteText(game.note, t),
            network: game.settings.network,
            finished_at: game.finished_at,
          }
        : null,
    history: ((past ?? []) as { id: string; team1: GameTeam; team2: GameTeam; team1_score: number; team2_score: number; winner: 1 | 2 | null; maps: GameMap[]; finished_at: string | null }[]).map((g) => ({
      id: g.id,
      team1: g.team1.name,
      team2: g.team2.name,
      team1_score: g.team1_score,
      team2_score: g.team2_score,
      winner: g.winner,
      maps: g.maps.map((m) => m.map),
      finished_at: g.finished_at,
    })),
    mapImages,
  };
}
