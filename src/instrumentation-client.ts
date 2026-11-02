/*
 * Полифилы для старых iPhone (Safari 15 – 16.3): Next.js 16 по умолчанию рассчитан на Safari 16.4+,
 * а у части игроков старая iOS — без этих функций страница падала («возникла проблема»).
 * Синтаксис переводит сборка (browserslist в package.json), здесь — недостающие методы.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function define(target: any, name: string, value: unknown) {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
}

function at(this: any, i: number) {
  const n = Math.trunc(i) || 0;
  const k = n < 0 ? this.length + n : n;
  return k < 0 || k >= this.length ? undefined : this[k];
}
define(Array.prototype, "at", at);
define(String.prototype, "at", at);

define(Object, "hasOwn", (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k));

define(Array.prototype, "findLast", function (this: any[], fn: (v: any, i: number, a: any[]) => boolean, self?: unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (fn.call(self, this[i], i, this)) return this[i];
  return undefined;
});
define(Array.prototype, "findLastIndex", function (this: any[], fn: (v: any, i: number, a: any[]) => boolean, self?: unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (fn.call(self, this[i], i, this)) return i;
  return -1;
});

define(Array.prototype, "toSorted", function (this: any[], cmp?: (a: any, b: any) => number) {
  return [...this].sort(cmp);
});
define(Array.prototype, "toReversed", function (this: any[]) {
  return [...this].reverse();
});

define(Promise, "withResolvers", function <T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
});
