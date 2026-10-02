// Проверки серверного ПК: версия CS2, ожидающая перезагрузка Windows, «Проверка перед турниром».
// Только чтение системных настроек: агент ничего не меняет в Windows.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PatchVersion из steam.inf — по нему Steam отвечает, актуален ли сервер (ISteamApps/UpToDateCheck) */
export function cs2Patch(serverDir) {
  const f = path.join(serverDir, "game", "csgo", "steam.inf");
  if (!existsSync(f)) return null;
  return /PatchVersion=([\d.]+)/.exec(readFileSync(f, "utf8"))?.[1] ?? null;
}

const regExists = (key) =>
  new Promise((resolve) => {
    execFile("reg", ["query", key], { windowsHide: true, timeout: 8000 }, (err) => resolve(!err));
  });

/**
 * Windows ждёт перезагрузку (установлены обновления) — может перезапустить ПК сама посреди турнира.
 * Читаем только стандартные признаки: WindowsUpdate RebootRequired и CBS RebootPending.
 */
export async function rebootPending() {
  if (process.platform !== "win32") return null;
  const [wu, cbs] = await Promise.all([
    regExists("HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired"),
    regExists("HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending"),
  ]);
  return wu || cbs;
}

/** Ждём, пока сервер начнёт отвечать по RCON (после запуска CS2 грузится 10–60 с) */
async function waitRcon(ctx, inst, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const out = await ctx.rcon(inst.port, ctx.rconPassword, "get5_status").catch(() => null);
    if (out != null) {
      try {
        return JSON.parse(out.slice(out.indexOf("{")));
      } catch {
        return { gamestate: "unknown" };
      }
    }
    await sleep(3000);
  }
  return null;
}

/**
 * «Проверка перед турниром»: каждый активный инстанс запускается (если выключен), отвечает по RCON,
 * грузит de_mirage, MatchZy загружен. Инстансы с матчем не трогаем — только проверяем RCON.
 * После проверки выключенные до неё инстансы снова выключаются.
 */
export async function selfCheck(ctx, payload) {
  const startedAt = new Date().toISOString();
  const names = Array.isArray(payload?.instances) && payload.instances.length ? payload.instances : ctx.instances.filter((i) => i.role === "active").map((i) => i.name);
  const runningBefore = await ctx.listRunning();
  const instances = [];

  for (const name of names) {
    const inst = ctx.instances.find((i) => i.name === name);
    if (!inst) continue;
    const t0 = Date.now();
    const wasRunning = runningBefore.has(name);
    const rec = { name, was_running: wasRunning, rcon: false, map: null, map_ok: false, matchzy: null, css: null, metamod: null, seconds: 0 };
    try {
      if (!wasRunning) await ctx.runStart(name, false);
      const g5 = await waitRcon(ctx, inst, wasRunning ? 15_000 : 120_000);
      rec.rcon = !!g5;
      if (!g5) throw new Error("RCON не ответил");
      if (g5.gamestate && g5.gamestate !== "none" && g5.gamestate !== "unknown") {
        rec.skipped = `в матче (${g5.gamestate}) — не трогаю`;
      } else {
        if ((await ctx.a2sInfo(inst.port))?.map !== "de_mirage") {
          await ctx.rcon(inst.port, ctx.rconPassword, "changelevel de_mirage").catch(() => {});
        }
        for (let k = 0; k < 20; k++) {
          const info = await ctx.a2sInfo(inst.port);
          rec.map = info?.map ?? rec.map;
          if (info?.map === "de_mirage") break;
          await sleep(3000);
        }
        rec.map_ok = rec.map === "de_mirage";
      }
      const plugins = await ctx.rcon(inst.port, ctx.rconPassword, "css_plugins list").catch(() => "");
      rec.matchzy = /"?MatchZy"?\s*\(([\w.+-]+)\)/i.exec(plugins)?.[1] ?? (/MatchZy/i.test(plugins) ? "загружен" : null);
      const meta = await ctx.rcon(inst.port, ctx.rconPassword, "meta version").catch(() => "");
      rec.metamod = /Metamod:Source version (\d[\w.+-]*)/.exec(meta)?.[1] ?? null;
      const css = await ctx.rcon(inst.port, ctx.rconPassword, "css").catch(() => "");
      rec.css = /API Version: v?\d+ \(([\d.]+)/i.exec(css)?.[1] ?? /API Version: (v?[\d.]+)/i.exec(css)?.[1] ?? null;
    } catch (e) {
      rec.error = String(e?.message ?? e);
    }
    // возвращаем в прежнее состояние: был выключен — выключаем
    if (!wasRunning && !rec.skipped) await ctx.runStart(name, true).catch(() => {});
    rec.seconds = Math.round((Date.now() - t0) / 1000);
    instances.push(rec);
  }

  // выделенный сервер CS2 хранит Workshop-карты в gamein\win64\steamapps (бывает и в корневом steamapps)
  const workshopRoots = [
    path.join(ctx.serverDir, "game", "bin", "win64", "steamapps", "workshop", "content", "730"),
    path.join(ctx.serverDir, "steamapps", "workshop", "content", "730"),
  ];
  const host = await ctx.hostSnapshot();
  return JSON.stringify({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    instances,
    host: {
      disk_free_gb: host.disk_free_gb ?? null,
      cs2_patch: cs2Patch(ctx.serverDir),
      cs2_build: host.cs2_build ?? null,
      reboot_pending: await rebootPending(),
      versions: host.versions ?? {},
      workshop: (payload?.workshop_ids ?? []).map((id) => ({ id: String(id), cached: workshopRoots.some((r) => existsSync(path.join(r, String(id)))) })),
      relay: ctx.relayStats(),
      site_rtt_ms: ctx.siteRtt(),
    },
  });
}
