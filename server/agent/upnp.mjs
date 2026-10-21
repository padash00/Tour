// UPnP: проброс игровых портов на роутере серверного ПК и его внешний адрес.
// Нужен, когда игровые ПК в другой подсети, чем сервер (сервер за своим роутером).
// Без зависимостей: SSDP (UDP multicast) + SOAP (fetch). Пароль от роутера не нужен.
import dgram from "node:dgram";

const SEARCH = (st) =>
  Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`);

/** Найти роутер (Internet Gateway Device) в сети интерфейса lanIp */
async function discover(lanIp) {
  const sock = dgram.createSocket("udp4");
  const found = new Set();
  sock.on("message", (m) => {
    const loc = /LOCATION:\s*(\S+)/i.exec(m.toString())?.[1];
    if (loc) found.add(loc);
  });
  sock.on("error", () => {});
  await new Promise((r) => sock.bind({ address: lanIp }, r));
  const gw = lanIp.replace(/\.\d+$/, ".1");
  for (const st of ["urn:schemas-upnp-org:device:InternetGatewayDevice:1", "upnp:rootdevice"]) {
    sock.send(SEARCH(st), 1900, "239.255.255.250");
    sock.send(SEARCH(st), 1900, gw);
  }
  await new Promise((r) => setTimeout(r, 2500));
  sock.close();
  for (const loc of found) {
    try {
      const xml = await (await fetch(loc, { signal: AbortSignal.timeout(4000) })).text();
      const m = /<serviceType>(urn:schemas-upnp-org:service:WAN(?:IP|PPP)Connection:\d)<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/.exec(xml);
      if (m) return { type: m[1], url: new URL(m[2], loc).toString(), model: /<modelName>([^<]*)/.exec(xml)?.[1] ?? null };
    } catch {}
  }
  return null;
}

async function soap(gw, action, args = "") {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${gw.type}">${args}</u:${action}></s:Body></s:Envelope>`;
  const res = await fetch(gw.url, {
    method: "POST",
    headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: `"${gw.type}#${action}"` },
    body,
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${action}: HTTP ${res.status} ${/<errorDescription>([^<]*)/.exec(text)?.[1] ?? ""}`.trim());
  return text;
}

let gateway = null;

/**
 * Проверить и при необходимости восстановить проброс UDP-портов инстансов на lanIp.
 * Возвращает состояние для сайта: { ip, model, mapped, error, at }.
 */
export async function ensureUpnp(lanIp, ports, tcpPorts = []) {
  const at = new Date().toISOString();
  try {
    gateway ??= await discover(lanIp);
    if (!gateway) return { ip: null, model: null, mapped: [], mapped_tcp: [], error: "роутер не отвечает по UPnP", at };
    const ip = /<NewExternalIPAddress>([^<]*)/.exec(await soap(gateway, "GetExternalIPAddress"))?.[1] || null;
    // AddPortMapping идемпотентен: то же правило просто обновляется (lease 0 — без срока)
    const map = (port, proto, what) =>
      soap(
        gateway,
        "AddPortMapping",
        `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort><NewProtocol>${proto}</NewProtocol><NewInternalPort>${port}</NewInternalPort><NewInternalClient>${lanIp}</NewInternalClient><NewEnabled>1</NewEnabled><NewPortMappingDescription>F16 ${what} ${port}</NewPortMappingDescription><NewLeaseDuration>0</NewLeaseDuration>`,
      );
    const mapped = [];
    for (const port of ports) {
      await map(port, "UDP", "CS2");
      mapped.push(port);
    }
    // раздача демо: без неё игры работают — её ошибка не отменяет игровые порты
    const mapped_tcp = [];
    let tcpError = null;
    for (const port of tcpPorts) {
      try {
        await map(port, "TCP", "demos");
        mapped_tcp.push(port);
      } catch (e) {
        tcpError = `TCP ${port}: ${e.message ?? e}`;
      }
    }
    return { ip, model: gateway.model, mapped, mapped_tcp, tcp_error: tcpError, error: null, at };
  } catch (e) {
    gateway = null; // в следующий раз найти роутер заново
    return { ip: null, model: null, mapped: [], mapped_tcp: [], error: String(e.message ?? e), at };
  }
}
