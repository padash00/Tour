// Пары закрытого турнира 2×2: баланс по ELO, запасной при нечётном числе, замена местами.
import assert from "node:assert/strict";
import { makePairs, pairElo, pairName, swapPlayers, type PairPlayer } from "../src/lib/private-pairs";

const P = (id: string, elo: number | null): PairPlayer => ({ id, nickname: id, elo });
const players = [P("a", 2400), P("b", 2100), P("c", 1800), P("d", null), P("e", 900), P("f", 1200), P("g", 600)];

for (let run = 0; run < 200; run++) {
  const plan = makePairs(players, "elo");
  assert.equal(plan.pairs.length, 3);
  assert.deepEqual(plan.reserve.map((p) => p.id), ["d"], "нечётное по ELO — запасной самый слабый (без FACEIT)");
  // в каждой паре один из сильной половины (a, b, c) и один из слабой (f, e, g)
  for (const [x, y] of plan.pairs) {
    assert.ok(["a", "b", "c"].includes(x.id), `первый — сильный: ${x.id}`);
    assert.ok(["e", "f", "g"].includes(y.id), `второй — слабый: ${y.id}`);
  }
  const used = [...plan.pairs.flat(), ...plan.reserve].map((p) => p.id).sort();
  assert.deepEqual(used, players.map((p) => p.id).sort(), "каждый игрок ровно один раз");

  const rnd = makePairs(players, "random");
  assert.equal(rnd.pairs.length, 3);
  assert.equal(rnd.reserve.length, 1);
  assert.deepEqual([...rnd.pairs.flat(), ...rnd.reserve].map((p) => p.id).sort(), players.map((p) => p.id).sort());
}

const even = makePairs(players.slice(0, 6), "elo");
assert.equal(even.reserve.length, 0);
assert.equal(even.pairs.length, 3);

// случайность действительно перемешивает: за 200 прогонов у «a» больше одного напарника
const partners = new Set<string>();
for (let i = 0; i < 200; i++) partners.add(makePairs(players, "elo").pairs.find(([x]) => x.id === "a")![1].id);
assert.ok(partners.size > 1, "сильный игрок получает разных напарников");

const plan = { pairs: [[P("a", 1), P("b", 2)], [P("c", 3), P("e", 4)]] as [PairPlayer, PairPlayer][], reserve: [P("d", 0)] };
const sw = swapPlayers(plan, "b", "d");
assert.deepEqual(sw.pairs[0].map((p) => p.id), ["a", "d"]);
assert.deepEqual(sw.reserve.map((p) => p.id), ["b"]);
assert.equal(swapPlayers(plan, "a", "zzz"), plan, "неизвестный игрок — без изменений");
assert.equal(pairElo([P("x", 2000), P("y", null)]), 2000);
assert.equal(pairName([P("Nick1", 1), P("Nick2", 2)]), "Nick1 + Nick2");
console.log("private pairs: ok");
