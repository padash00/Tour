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

console.log(failed ? `\n${failed} ошибок` : "\nвсё верно");
process.exit(failed ? 1 : 0);
