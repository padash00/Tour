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
  async flush(send) {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const [id, entry] of Object.entries(this.entries)) {
        if (entry.state !== "finished" || entry.acked) continue;
        await send({ id, ...entry.reply });
        entry.acked = true;
        this.save();
      }
    } finally { this.flushing = false; }
  }
  get pendingResults() {
    return Object.values(this.entries).filter((e) => e.state === "finished" && !e.acked).length;
  }
}
