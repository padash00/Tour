// Проверка чистой логики лобби без базы: приведение настроек, проверка карт, cvars для MatchZy, вето лобби.
// Запуск: npx tsx scripts/test-lobby-settings.mts
import { DEFAULT_SETTINGS, lobbyCvars, mapsProblem, normalizeSettings, withMode } from "../src/lib/lobby-settings";
import { vetoState } from "../src/lib/veto";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

// приведение: мусор отбрасывается, числа зажимаются в пределы
const s = normalizeSettings({ best_of: 7, team_size: 9, start_money: 99999, max_money: 1000, maps: ["de_mirage", "bad map", "aim_map@3070549948", "de_mirage"], evil: 1 });
check(s.best_of === DEFAULT_SETTINGS.best_of, "best_of вне 1/3/5 → по умолчанию");
check(s.team_size === 5, "размер команды не больше 5");
check(s.max_money === 1000 && s.start_money === 1000, "начальные деньги не больше максимума");
check(s.maps.join(",") === "de_mirage,aim_map@3070549948", "карты: без мусора и повторов, мастерская проходит");
check(!("evil" in s), "лишние поля отбрасываются");
check(normalizeSettings(null).mode === "5v5", "пустые настройки → по умолчанию");

// режим подтягивает размер команды и раунды
const w = withMode(DEFAULT_SETTINGS, "2v2");
check(w.team_size === 2 && w.max_rounds === 16, "Wingman: 2 игрока, MR16");

// карты
check(mapsProblem({ ...DEFAULT_SETTINGS, best_of: 3, map_choice: "host", maps: ["de_mirage"] })?.includes("ещё 2 карты") === true, "BO3 хостом: просит ещё 2 карты");
check(mapsProblem({ ...DEFAULT_SETTINGS, best_of: 5, map_choice: "host", maps: ["a1", "a2"] })?.includes("ещё 3 карты") === true, "BO5: ещё 3 карты");
check(mapsProblem({ ...DEFAULT_SETTINGS, best_of: 1, map_choice: "veto", maps: ["de_mirage"] }) !== null, "вето BO1 с одной картой — нельзя");
check(mapsProblem({ ...DEFAULT_SETTINGS, best_of: 3, map_choice: "veto", maps: ["a", "b", "c", "d"] }) === null, "вето BO3 из 4 карт — можно");
check(mapsProblem({ ...DEFAULT_SETTINGS, best_of: 3, map_choice: "random", maps: ["a"] }) === null, "случайно: хватает одной карты (повторяется)");

// cvars
const c = lobbyCvars({ ...DEFAULT_SETTINGS, voice: "all", headshot_only: true, armor: "helmet", gotv: true }, 0, 10);
check(c.sv_alltalk === 1 && c.sv_full_alltalk === 1, "голос всем → alltalk");
check(c.mp_damage_headshot_only === 1 && c.mp_free_armor === 2, "только в голову, броня со шлемом");
check(c.tv_maxclients === 10 && c.bot_quota === 0 && !("bot_quota_mode" in c), "GOTV для зрителей, без ботов quota 0");
const b = lobbyCvars({ ...DEFAULT_SETTINGS, bot_difficulty: 3 }, 3, 7);
check(b.bot_quota === 10 && b.bot_quota_mode === "fill" && b.bot_difficulty === 3, "боты: всего 10 мест, fill, эксперт");
check(Object.values(b).every((v) => typeof v === "number" || /^\w+$/.test(String(v))), "все значения cvars без пробелов и кавычек");

// вето лобби: BO3 из 7 карт заканчивается тремя картами
const pool = ["a", "b", "c", "d", "e", "f", "g"];
const acts: { step: number; team_id: string | null; action: "ban" | "pick" | "decider"; map_name: string }[] = [];
for (let i = 0; i < 20; i++) {
  const st = vetoState(3, pool, acts);
  if (!st.current) break;
  acts.push({ step: st.current.step, team_id: String(st.current.team), action: st.current.action, map_name: st.remaining[0] });
}
check(acts.filter((a) => a.action !== "ban").length === 3, "вето BO3: 2 пика + десайдер");

// вето BO5: при любом пуле от 5 карт — ровно 5 карт серии (раньше пул 6 или 8 давал 6 карт)
for (const size of [5, 6, 7, 8, 9]) {
  const p = Array.from({ length: size }, (_, i) => `m${i}`);
  const list: typeof acts = [];
  for (let i = 0; i < 20; i++) {
    const st = vetoState(5, p, list);
    if (!st.current) break;
    list.push({ step: st.current.step, team_id: String(st.current.team), action: st.current.action, map_name: st.remaining[0] });
  }
  const bans = list.filter((a) => a.action === "ban").length;
  check(list.length - bans === 5 && (size !== 7 || bans === 2), `вето BO5 из ${size} карт: 5 карт серии`);
}

// «Десятка»: тиры по FACEIT ELO, змейка, жёсткие правила режима
const { tierOf, snakeTurn, normalizeTiers } = await import("../src/lib/tiers");
const { potBank } = await import("../src/lib/lobby-settings");
check(tierOf(3000, 10) === "S" && tierOf(2999, 10) === "A" && tierOf(2800, 10) === "A" && tierOf(2799, 10) === "B", "тиры: S от 3000, A 2800–2999");
check(tierOf(2500, 10) === "B" && tierOf(2499, 10) === "C" && tierOf(2200, 10) === "C" && tierOf(2199, 10) === "D", "тиры: B от 2500, C от 2200, ниже — D");
check(tierOf(1900, 9) === "D" && tierOf(1700, 8) === "D" && tierOf(1000, 3) === "D" && tierOf(999, 10) === "D" && tierOf(1, 1) === "D" && tierOf(null, 10) === null && tierOf(0, 10) === null, "тир D — любой ELO ниже 2200, нижней границы нет; без ELO тира нет");
check([0, 1, 2, 3, 4, 5, 6, 7].map(snakeTurn).join("") === "12211221", "змейка: 1-2-2-1-1-2-2-1");
check(normalizeTiers(["B", "S", "x", "B"]).join("") === "SB" && normalizeTiers([]).length === 5 && normalizeTiers("S").length === 5, "список тиров: только известные, по порядку; пустой — все");
const PID = "01a99432-d7ed-47aa-a3b9-155c4774711f";
const potS = normalizeSettings({ pot: true, pot_fee: 5000, pot_tiers: ["S"], mode: "2v2", team_size: 2, network: "lan", player_pick: "free", allow_join_team: true, pot_paid: ["x", PID], pot_elo: { [PID]: 3100.4, bad: 5 } });
check(potS.mode === "5v5" && potS.team_size === 5 && potS.network === "internet" && potS.player_pick === "captains" && !potS.allow_join_team, "«Десятка»: всегда 5×5, интернет, выбор капитанами");
check(potBank(potS) === 50000 && potS.pot_paid.length === 1 && Object.keys(potS.pot_elo).length === 1 && potS.pot_elo[PID] === 3100, "«Десятка»: банк 50 000, отметки и ELO — только по id игроков");
const plain = normalizeSettings({ pot: false, pot_paid: [PID], pot_fee: 100 });
check(!plain.pot && plain.pot_paid.length === 0 && plain.network === "lan", "обычное лобби: отметок взносов нет, правила «Десятки» не действуют");

// стороны: старые записи, три режима, выбор стороны после пика
{
  const { sideMode } = await import("../src/lib/lobby-settings");
  const { sidePending, vetoTurn, seriesSides, ctTeamOf } = await import("../src/lib/veto");
  check(normalizeSettings({ knife: false }).sides === "swap" && normalizeSettings({ knife: true }).sides === "knife", "стороны: старая запись без sides читается по переключателю ножа");
  const pickS = normalizeSettings({ sides: "pick", knife: false, map_choice: "veto", best_of: 3, maps: ["de_a", "de_b", "de_c", "de_d", "de_e", "de_f", "de_g"] });
  check(pickS.sides === "pick" && pickS.knife === true, "стороны: sides главнее старого переключателя, нож при «по пикам» есть");
  check(sideMode(pickS) === "pick" && sideMode({ ...pickS, best_of: 1 }) === "knife" && sideMode({ ...pickS, map_choice: "host" }) === "knife", "стороны «по пикам» работают только с бан-пиком и серией от BO3, иначе нож");
  check(normalizeSettings({ sides: "мусор" }).sides === DEFAULT_SETTINGS.sides, "стороны: мусор → по умолчанию");

  const pool = ["de_a", "de_b", "de_c", "de_d", "de_e", "de_f", "de_g"];
  const o = { sideChoice: true, team1: "A", team2: "B" };
  type Act = { step: number; team_id: string | null; action: "ban" | "pick" | "decider"; map_name: string; side?: string | null };
  const acts: Act[] = [
    { step: 1, team_id: "A", action: "ban", map_name: "de_a" },
    { step: 2, team_id: "B", action: "ban", map_name: "de_b" },
    { step: 3, team_id: "A", action: "pick", map_name: "de_c", side: null },
  ];
  check(sidePending(acts, true)?.map_name === "de_c" && sidePending(acts, false) === null, "после пика вето ждёт выбор стороны — только в режиме «по пикам»");
  const t1 = vetoTurn(3, pool, acts, o);
  check(t1?.action === "side" && t1.teamId === "B" && t1.map === "de_c", "сторону на карте выбирает соперник пикнувшего");
  acts[2].side = "t";
  const t2 = vetoTurn(3, pool, acts, o);
  check(t2?.action === "pick" && t2.teamId === "B", "сторона выбрана — ход переходит к следующему пику");
  check(ctTeamOf(acts[2], o) === "A", "соперник взял T — за CT начинает пикнувший");
  acts.push({ step: 4, team_id: "B", action: "pick", map_name: "de_d", side: "ct" });
  check(ctTeamOf(acts[3], o) === "A", "соперник взял CT — он и начинает за CT");
  const all: Act[] = [...acts, { step: 5, team_id: "A", action: "ban", map_name: "de_e" }, { step: 6, team_id: "B", action: "ban", map_name: "de_f" }, { step: 7, team_id: null, action: "decider", map_name: "de_g" }];
  check(seriesSides(["de_c", "de_d", "de_g"], all, { ...o, knife: true }).join() === "team1_ct,team1_ct,knife", "MatchZy: стороны пикнутых карт заданы, решающая — нож");
  check(seriesSides(["de_c", "de_d", "de_g"], all, { ...o, sideChoice: false, knife: false }).join() === "team1_ct,team2_ct,team1_ct", "без режима «по пикам» стороны как раньше: чередование или нож");
  check(vetoTurn(3, pool, all, o) === null, "вето закончено — хода нет");
}

console.log(failed ? `\n${failed} ошибок` : "\nвсё верно");
process.exit(failed ? 1 : 0);
