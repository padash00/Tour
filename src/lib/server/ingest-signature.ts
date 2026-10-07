import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Подпись адреса HTTP-лога CS2 (logaddress_add_http). Заголовки CS2 задать не умеет, поэтому раньше
 * в адресе лежал сам MATCHZY_TOKEN (&t=…) — и попадал в консоль сервера, логи буфера и журналы запросов.
 * Теперь в адресе только номер матча и HMAC(MATCHZY_TOKEN, номер матча): подпись годится для одного матча
 * и не раскрывает токен.
 */

const PURPOSE = "cs2-log:";

export function logSignature(matchzyId: number | string, token: string) {
  return createHmac("sha256", token).update(`${PURPOSE}${matchzyId}`).digest("hex");
}

export function verifyLogSignature(matchzyId: number | string, sig: string, token: string) {
  if (!token || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = Buffer.from(logSignature(matchzyId, token), "hex");
  const actual = Buffer.from(sig, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Query для /api/cs2/log: ?m=<matchzy_id>&sig=<подпись> */
export function signedLogQuery(matchzyId: number | string, token: string) {
  return `m=${encodeURIComponent(String(matchzyId))}&sig=${logSignature(matchzyId, token)}`;
}
