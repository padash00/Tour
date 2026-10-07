import "server-only";
import { db } from "./supabase";
import { getMapImages } from "./settings";
import {
  captainsOf,
  checkHostAway,
  getGame,
  getLobbyByCode,
  getMembers,
  isOnline,
  lobbyHasDue,
  lobbyTimeouts,
  lobbyVetoState,
  type GameMap,
  type GameTeam,
  type GameVeto,
  type Lobby,
  type Slot,
} from "./lobby";
import type { LobbySettings } from "./lobby-settings";
import type { Player } from "./types";

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
  veto_action: "ban" | "pick" | null;
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
  captains: [string | null, string | null];
  members: ViewMember[];
  bans: { id: string; nickname: string }[];
  messages: { id: number; player_id: string | null; nickname: string | null; avatar_url: string | null; body: string; created_at: string }[];
  game: ViewGame | null;
  history: { id: string; team1: string; team2: string; team1_score: number; team2_score: number; winner: 1 | 2 | null; maps: string[]; finished_at: string | null }[];
  mapImages: Record<string, string>;
};

/**
 * Состояние лобби для страницы. Заодно: отмечает зрителя «в сети», применяет истёкшие таймеры
 * (драфт, проверка готовности, вето) и передаёт хоста, если он давно не заходил.
 */
export async function buildLobbyView(code: string, viewer: Player | null, opts: { admin: boolean }): Promise<LobbyView | null> {
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
  const access: LobbyView["access"] =
    lobby.status === "closed" && !mine && !opts.admin ? "closed_lobby" : mine || opts.admin || lobby.visibility === "public" ? "ok" : "password";
  // приватное лобби постороннему без ссылки-приглашения не показываем вовсе
  const hidden = access !== "ok" && lobby.visibility === "private";
  const inGame = !!viewer && !!game && [...game.team1.players, ...game.team2.players].some((p) => p.id === viewer.id);
  const seesAddress = opts.admin || inGame || mine?.slot === "spec";

  const [{ data: msgs }, { data: bans }, { data: past }, mapImages] = await Promise.all([
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
  ]);

  const host = members.find((m) => m.player_id === lobby.host_id);
  let gotv: string | null = null;
  if (game?.server_address && game.settings.gotv) {
    const [ip, port] = game.server_address.split(":");
    gotv = `${ip}:${Number(port) + 5}`;
  }
  const vstate = game?.status === "veto" ? lobbyVetoState(game) : null;

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
    members: hidden
      ? []
      : members.map((m) => ({
          id: m.player_id,
          steam_id: m.player.steam_id,
          nickname: m.player.nickname,
          avatar_url: m.player.avatar_url,
          faceit_level: m.player.faceit_level,
          faceit_elo: m.player.faceit_elo,
          slot: m.slot,
          ready: m.ready,
          online: isOnline(m),
        })),
    bans: ((bans ?? []) as unknown as { player: { id: string; nickname: string } }[]).map((b) => b.player),
    messages: ((msgs ?? []) as unknown as { id: number; player_id: string | null; body: string; created_at: string; player: { nickname: string; avatar_url: string | null } | null }[])
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
            veto_deadline: game.veto_deadline,
            veto_turn: vstate?.current && vstate.current.action !== "decider" ? vstate.current.team : null,
            veto_action: vstate?.current && vstate.current.action !== "decider" ? vstate.current.action : null,
            team1_score: game.team1_score,
            team2_score: game.team2_score,
            winner: game.winner,
            server_state: game.server_state,
            server_address: seesAddress && game.server_state === "ready" ? game.server_address : null,
            // GOTV раскрывает адрес сервера — только участникам лобби и админам
            gotv_address: game.server_state === "ready" && (!!mine || opts.admin) ? gotv : null,
            note: game.note,
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
