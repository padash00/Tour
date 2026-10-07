import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/** Durable execution receipts. A repeated delivery never repeats a running or
 * completed command. After a process crash the outcome is explicitly uncertain. */
export class CommandJournal {
  constructor(file, now = Date.now) {
    this.file = file;
    this.now = now;
    this.entries = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    if (!this.entries || Array.isArray(this.entries) || typeof this.entries !== "object") throw new Error("Invalid command journal");
    for (const entry of Object.values(this.entries)) {
      if (!["accepted", "running", "finished"].includes(entry.state)) throw new Error("Invalid command journal entry");
      if (entry.state === "running") {
        entry.state = "finished";
        entry.reply = { ok: false, result: "Агент перезапущен во время команды. Результат неизвестен — проверьте сервер перед повтором." };
        entry.acked = false;
      }
    }
    this.save();
  }
  save() {
    // Keep undelivered results indefinitely. Only acknowledged receipts expire.
    for (const [id, entry] of Object.entries(this.entries)) {
      if (entry.acked && this.now() - entry.at > 7 * 86400_000) delete this.entries[id];
    }
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.entries), { flush: true });
    renameSync(`${this.file}.tmp`, this.file);
  }
  accept(commands) {
    for (const cmd of commands) {
      if (!this.entries[cmd.id]) this.entries[cmd.id] = { state: "accepted", at: this.now(), acked: false };
      // A server retry can mean the previous HTTP acknowledgement was lost.
      else if (this.entries[cmd.id].state === "finished") this.entries[cmd.id].acked = false;
    }
    this.save();
  }
  begin(id) {
    const entry = this.entries[id];
    if (!entry || entry.state !== "accepted") return false;
    entry.state = "running";
    this.save(); // Persist before touching the CS2 process.
    return true;
  }
  complete(id, reply) {
    const entry = this.entries[id];
    if (!entry) throw new Error("Command was not accepted");
    entry.state = "finished";
    entry.reply = { ok: reply.ok === true, result: String(reply.result ?? "").slice(0, 20_000) };
    entry.acked = false;
    this.save();
  }
  /**
   * Delivers every undelivered result. One failed acknowledgement does not hold back the others.
   * A permanent rejection (4xx except auth/timeouts/rate limits: the site no longer expects this
   * command) is parked, so it is not retried forever. Transient failures are retried on the next
   * flush; the first of them is rethrown after all results were attempted.
   */
  async flush(send) {
    if (this.flushing) return { sent: 0, parked: 0, failed: 0 };
    this.flushing = true;
    const out = { sent: 0, parked: 0, failed: 0 };
    let firstError = null;
    try {
      for (const [id, entry] of Object.entries(this.entries)) {
        if (entry.state !== "finished" || entry.acked) continue;
        try {
          await send({ id, ...entry.reply });
          entry.acked = true;
          out.sent++;
        } catch (e) {
          if (!isPermanentRejection(e)) {
            out.failed++;
            firstError ??= e;
            continue;
          }
          entry.acked = true;
          entry.parked = `HTTP ${e.status}`;
          out.parked++;
        }
        this.save();
      }
    } finally { this.flushing = false; }
    if (firstError) throw firstError;
    return out;
  }
  get pendingResults() {
    return Object.values(this.entries).filter((e) => e.state === "finished" && !e.acked).length;
  }
  /** Commands accepted or running: a self-update must wait for them to finish.
   * An accepted command that was never started (the site stopped redelivering it) stops counting after 10 minutes. */
  get inFlight() {
    return Object.values(this.entries)
      .filter((e) => e.state === "running" || (e.state === "accepted" && this.now() - e.at < 10 * 60_000)).length;
  }
}

export function isPermanentRejection(e) {
  const status = Number(e?.status);
  return status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status);
}
