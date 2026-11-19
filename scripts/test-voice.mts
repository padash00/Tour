// Голосовая связь без базы: ссылка привязки (подпись, срок) и комнаты команд по лобби.
// Запуск: npx tsx --conditions=react-server scripts/test-voice.mts
import { isTsUid, readVoiceToken, roomName, roomsOf, voiceToken } from "../src/lib/voice";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

const UID = "qRVW2tX5c1PmBGLk0v0aJ3X6m9E=";
check(isTsUid(UID) && !isTsUid("короткий") && !isTsUid(""), "идентификатор TeamSpeak: base64, не короче 20 знаков");

// ссылка привязки
const token = voiceToken(UID, "  altx_f4\n ");
const read = readVoiceToken(token);
check(read?.uid === UID && read.nick === "altx_f4", "ссылка читается обратно: идентификатор и ник без переводов строк");
check(readVoiceToken(token.slice(0, -2) + "xx") === null, "чужая подпись — ссылка не принимается");
const [body, mac] = token.split(".");
const forged = Buffer.from(JSON.stringify({ u: "AAAAAAAAAAAAAAAAAAAAAAAAAAA=", n: "x", e: Date.now() + 60_000 })).toString("base64url");
check(readVoiceToken(`${forged}.${mac}`) === null, "подмена идентификатора при старой подписи — не принимается");
check(readVoiceToken("") === null && readVoiceToken(null) === null && readVoiceToken(body) === null, "пустая и обрезанная ссылка — не принимается");
const realNow = Date.now;
Date.now = () => realNow() + 11 * 60_000;
check(readVoiceToken(token) === null, "через 11 минут ссылка устарела");
Date.now = realNow;

// названия каналов
check(roomName("Бомжи", "CCJTG5") === "Бомжи · CCJTG5", "название комнаты: команда и код лобби");
check(roomName("Очень длинное название команды для проверки обрезки", "CCJTG5").length <= 40, "название канала не длиннее 40 знаков");

// комнаты: обычное лобби на две команды
const settings = (players: number, cup_of: unknown = null) => ({ players, cup_of }) as never;
const lobby = { id: "L1", code: "AAAAAA", settings: settings(10), team1_name: "Ёбыри", team2_name: "Бомжи", bracket: null };
const members = [
  { lobby_id: "L1", player_id: "p1", slot: "team1" },
  { lobby_id: "L1", player_id: "p2", slot: "team1" },
  { lobby_id: "L1", player_id: "p3", slot: "team2" },
  { lobby_id: "L1", player_id: "p4", slot: "spec" },
  { lobby_id: "L1", player_id: "p5", slot: "wait" },
];
const uidOf = new Map([
  ["p1", "u1"],
  ["p3", "u3"],
  ["p4", "u4"],
]);
const rooms = roomsOf([lobby], members, uidOf);
check(rooms.length === 2 && rooms[0].key === "AAAAAA:team1" && rooms[1].key === "AAAAAA:team2", "две команды — две комнаты с ключами по коду лобби и слоту");
check(rooms[0].name === "Ёбыри · AAAAAA" && rooms[1].name === "Бомжи · AAAAAA", "комнаты названы по командам");
check(rooms[0].uids.join() === "u1" && rooms[1].uids.join() === "u3", "в комнате — только привязанные игроки команды; наблюдатель и ожидающий не попадают");

// одинаковые названия команд — каналы различаются
const same = roomsOf([{ ...lobby, team1_name: "Команда", team2_name: "Команда" }], members, uidOf);
check(same[0].name !== same[1].name, "две команды с одним названием — разные названия каналов");

// большое лобби на четыре команды: названия из сетки; комната матча (cup_of) своих комнат не создаёт
const big = { id: "L2", code: "BBBBBB", settings: settings(20), team1_name: "x", team2_name: "y", bracket: { names: ["Альфа", "Бета", "Гамма", "Дельта"] } };
const child = { id: "L3", code: "CCCCCC", settings: settings(10, { code: "BBBBBB", match: "m1" }), team1_name: "Альфа", team2_name: "Бета", bracket: null };
const bigMembers = [
  { lobby_id: "L2", player_id: "p1", slot: "team1" },
  { lobby_id: "L2", player_id: "p3", slot: "team4" },
  { lobby_id: "L3", player_id: "p1", slot: "team1" },
  { lobby_id: "L3", player_id: "p3", slot: "team2" },
];
const bigRooms = roomsOf([big, child], bigMembers, uidOf);
check(bigRooms.length === 2 && bigRooms.every((r) => r.key.startsWith("BBBBBB:")), "комната матча большого лобби не плодит своих комнат — команды сидят в комнатах общего лобби");
check(bigRooms[0].name === "Альфа · BBBBBB" && bigRooms[1].name === "Дельта · BBBBBB", "в большом лобби названия команд берутся из сетки");

if (failed) {
  console.error(`\nНе прошло проверок: ${failed}`);
  process.exit(1);
}
console.log("\nГолосовая связь: все проверки прошли");
