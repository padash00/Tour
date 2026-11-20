"""F16 Bot для TeamSpeak F16 Arena.

- «+ Создать комнату»: зашёл — бот создаёт личную временную комнату и переносит туда;
- команды в чате сервера / лобби / в личке: !помощь, !комната, !5x5, !онлайн, !ранг, !бронь, !турнир, !afk;
- ранги за часы в TeamSpeak (Свой → Завсегдатай → Легенда);
- приветствие новичков, перенос отошедших в AFK;
- «Привязка»: зашёл — бот шлёт в личку ссылку на сайт, по ней подключение привязывается к профилю игрока;
- «Телепорт»: привязанных игроков бот переносит в закрытую комнату их команды, когда в лобби началась игра,
  и возвращает обратно, когда она закончилась. Кто привязан и какие комнаты нужны — решает сайт (опрос раз в 5 с);
- состояние для панели status.commrent.kz и число онлайн для сайта.

Работает через ServerQuery, опрос раз в 2 секунды (IP бота в query_ip_allowlist — без флуд-лимитов).
Исходник — в репозитории турнирного сайта: server/teamspeak/bot.py. На сервере: /opt/teamspeak/tools/bot.py, служба ts-bot.
"""
import base64, json, os, re, socket, subprocess, sys, threading, time, traceback, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsq import TS, QueryError, esc, parse  # noqa: E402

STATE = "/opt/teamspeak/state.json"
PUBLIC = "/opt/teamspeak/www/status.json"
RANKS_FILE = "/opt/teamspeak/ranks.json"
FAST, SLOW = 1, 15

LOBBY, AFK_NAME, ROOMS, CREATE = "Лобби", "AFK", "Свои комнаты", "+ Создать комнату"
SKIP_CHANNELS = {"AFK", "Администрация"}
SKIP_NICKS = set()  # ники, которых бот не трогает (музыкального бота больше нет)
AWAY_AFTER = 2 * 60          # статус «отошёл» — через 2 минуты
MUTED_AFTER = 10 * 60        # выключен звук и молчит — через 10 минут
IDLE_AFTER = 60 * 60         # просто молчит — через час
RANKS = [(10 * 3600, "Свой"), (50 * 3600, "Завсегдатай"), (200 * 3600, "Легенда")]

# ── привязка профиля и комнаты команд ──
BIND, TELEPORT = "Привязка", "Телепорт"
TOUR = "https://tournament.f16-arena.kz"
SITE_API = TOUR + "/api/voice/bot"
SITE_ENV = "/opt/sites/tour/web.env"   # токен сайта (AGENT_TOKEN) читаем оттуда же, где его держит сайт
ICON_IDS = "/opt/teamspeak/icons/ids.json"
ROOM_TOPIC = "f16room:"                # тема канала-комнаты: по ней бот узнаёт свои комнаты после перезапуска
ROOM_JOIN_POWER = 50                   # сами в комнату команды зайдут только модераторы и админы; игроков переносит бот
SYNC, SYNC_TELE, SYNC_FAST = 5, 2, 1   # опрос сайта: обычно раз в 5 с; раз в 2 с — пока кто-то ждёт в «Телепорте»; каждую секунду — в «Привязке»
LINK_TTL = 9 * 60                      # ссылка привязки живёт 10 минут — новую шлём чуть раньше
SILENT_TALK_POWER = 100                # «Привязка» и «Телепорт» немые: такой силы голоса нет ни у кого, включая админов
ROOM_GRACE = 12                        # столько опросов подряд комнаты нет в ответе сайта — только тогда удаляем (≈ минута)
# значки каналов (PNG 16×16): номер значка = CRC32 файла
ICONS = {
    "bind": (299269252, "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQ0lEQVR42mPQb3jLAMX/ScRgfeRqhhtCiWYwHkQGYAPEyDHAFGAzHV0xuhxWAwgBggaQ5QKKw2CYpANKDKA4M1GUnQHY5sORmYx10QAAAABJRU5ErkJggg=="),
    "teleport": (1694617657, "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASElEQVR42mMQ2tHGAMX/ScRgfeRqhhtCiWYwpq4BMEBIDK8LSDUEqxdIMQRnGBBrCG0MoMgLFAUiVaJxQFIixZmJgCF1eLMzAFx6eMNyChg7AAAAAElFTkSuQmCC"),
}
BIND_TOPIC = "Привязка профиля F16 Arena: зайди — бот пришлёт ссылку"
BIND_DESC = (
    "[center][size=14][b]Привязка профиля[/b][/size][/center]\n\n"
    "[b]1.[/b] Зайди в этот канал.\n"
    "[b]2.[/b] Бот пришлёт ссылку в личные сообщения.\n"
    "[b]3.[/b] Открой её и подтверди, что это ты, — профиль на [url=%s]tournament.f16-arena.kz[/url] привяжется к твоему TeamSpeak.\n\n"
    "Привязка действует, пока ты на сервере. Сменить профиль — команда [b]!отвязать[/b].\n"
    "В этом канале не разговаривают." % TOUR
)
TELEPORT_TOPIC = "Жди игру здесь — бот перенесёт в комнату твоей команды"
TELEPORT_DESC = (
    "[center][size=14][b]Телепорт[/b][/size][/center]\n\n"
    "Зайди сюда перед игрой в лобби. Когда матч начнётся, бот сам перенесёт тебя в закрытую комнату твоей команды, "
    "а после матча вернёт обратно.\n\n"
    "Вышел из комнаты команды — зайди в «Телепорт» ещё раз, бот вернёт.\n"
    "Нужна привязка профиля: канал «Привязка».\n"
    "В этом канале не разговаривают — голос включится в комнате команды."
)
ROOM_DESC = "Комната команды на время матча в лобби. Игроков переносит бот из канала «Телепорт». Удалится после игры."
# комнаты команд создаются внизу, под «Свои комнаты» — там же, где комнаты игроков (нет такого канала — под «Телепортом»)
PM_LINK = ("[b]Привязка профиля F16 Arena[/b]\n"
           "Открой ссылку и подтверди, что это ты: [url=%s]привязать TeamSpeak к профилю[/url]\n"
           "Ссылка действует 10 минут. После привязки перенесу тебя в «Телепорт».")
PM_LINKED = "Готово! Ты привязан к профилю [b]%s[/b]. Жди игру в «Телепорте» — перед матчем перенесу в комнату твоей команды."
PM_ALREADY = "Ты уже привязан к профилю [b]%s[/b]. Сменить профиль — напиши [b]!отвязать[/b] и зайди в «Привязку» снова."
PM_NEED_BIND = "Чтобы я знал, в какую команду тебя перенести, сначала привяжи профиль — перенёс тебя в «Привязку»."
PM_ROOM = "Твоя команда здесь: [b]%s[/b]. Удачи!"
PM_BIND_HELP = ("Зайди в канал «Привязка» — пришлю ссылку, по ней TeamSpeak привяжется к твоему профилю на сайте турниров.\n"
                "Потом жди игру в «Телепорте»: перед матчем перенесу в комнату твоей команды. Отвязать профиль — [b]!отвязать[/b].")

SITE = "https://f16-arena.kz"
WELCOME = (
    "[b]Привет, %s! Ты на сервере F16 Arena.[/b]\n"
    "• Своя комната — зайди в «+ Создать комнату».\n"
    "• Собрать команду — напиши [b]!5x5[/b] в чат сервера.\n"
    "• Играешь в лобби на сайте — зайди в «Привязку», потом жди игру в «Телепорте».\n"
    "• Все команды — [b]!помощь[/b]."
)
HELP = (
    "[b]Команды F16 Bot[/b] (пиши в чат сервера, лобби или мне в личку):\n"
    "[b]!комната[/b] — своя комната, удалится сама, когда все выйдут\n"
    "[b]!5x5[/b] (или !2x2 … !5x5) — собрать команду: комната на N мест + клич в чат\n"
    "[b]!привязка[/b] — как привязать профиль сайта и попасть в комнату команды\n"
    "[b]!отвязать[/b] — снять привязку профиля\n"
    "[b]!онлайн[/b] — кто в каких каналах\n"
    "[b]!ранг[/b] — твои часы на сервере и следующий ранг\n"
    "[b]!бронь[/b] — забронировать ПК в клубе\n"
    "[b]!турнир[/b] — турниры F16 Arena\n"
    "[b]!afk[/b] — уйти в AFK"
)



def log(*a):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), *a, flush=True)


def write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def site_token():
    try:
        for line in open(SITE_ENV, encoding="utf-8"):
            if line.startswith("AGENT_TOKEN="):
                return line.split("=", 1)[1].strip().strip("'").strip('"')
    except OSError:
        pass
    return ""


def hours(sec):
    h = sec / 3600
    return ("%.1f" % h).replace(".", ",") if h < 10 else str(int(h))


class Bot:
    def __init__(self):
        self.ts = TS()
        try:
            self.ts.cmd("clientupdate client_nickname=" + esc("F16 Bot"))
        except Exception:
            pass
        self.me = self.ts.cmd("whoami")[0]["client_id"]
        self.seen = None
        self.ranks = self.load_ranks()
        self.ranks_dirty = False
        # привязка и комнаты команд
        self.token = site_token()
        self.site_err_at = 0
        self.bind_sent = {}    # clid -> когда отправили ссылку привязки (пока игрок сидит в «Привязке»)
        self.described = {}    # clid -> ник профиля, уже записанный в описание клиента
        self.room_told = {}    # clid -> комната, о переносе в которую уже написали
        self.room_gone = {}    # ключ комнаты -> сколько опросов подряд её нет в ответе сайта
        self.voice_cids = set()
        self.refresh()
        self.ts.cmd("clientmove clid=%s cid=%s" % (self.me, self.cid[LOBBY]))
        try:
            self.ensure_voice_channels()
        except Exception as e:
            log("voice channels", e)
        for ev in ("textserver", "textprivate"):
            self.ts.cmd("servernotifyregister event=" + ev)
        self.ts.cmd("servernotifyregister event=textchannel id=" + self.cid[LOBBY])
    # ── данные сервера ──
    def refresh(self):
        self.chans = self.ts.cmd("channellist -topic")
        self.cname = {c["cid"]: c["channel_name"] for c in self.chans}
        self.cid = {c["channel_name"]: c["cid"] for c in self.chans}
        self.groups = {g["name"]: g["sgid"] for g in self.ts.cmd("servergrouplist") if g.get("type") == "1"}
        self.cgroups = {g["name"]: g["cgid"] for g in self.ts.cmd("channelgrouplist") if g.get("type") == "1"}

    def clients(self):
        return [c for c in self.ts.cmd("clientlist -uid -times -away -voice -country -groups") if c.get("client_type") == "0"]

    def pm(self, clid, text):
        self.ts.cmd("sendtextmessage targetmode=1 target=%s msg=%s" % (clid, esc(text)))

    def say(self, text):
        self.ts.cmd("sendtextmessage targetmode=3 target=1 msg=%s" % esc(text))

    # ── привязка профиля и комнаты команд ──
    def site(self, action, **data):
        """Запрос к сайту турниров. None — сайт не ответил: в этот раз ничего не меняем."""
        if not self.token:
            return None
        req = urllib.request.Request(
            SITE_API, data=json.dumps(dict(data, action=action)).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.token, "User-Agent": "F16Bot"})
        try:
            with urllib.request.urlopen(req, timeout=4) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if time.time() - self.site_err_at > 300:  # не чаще раза в 5 минут
                log("site", action, e)
                self.site_err_at = time.time()
            return None

    def upload_icons(self):
        for iid, b64 in ICONS.values():
            try:
                data = base64.b64decode(b64)
                r = self.ts.cmd("ftinitupload clientftfid=%d name=%s cid=0 cpw= size=%d overwrite=1 resume=0"
                                % (iid % 30000 + 1, esc("/icon_%d" % iid), len(data)))[0]
                s = socket.create_connection(("127.0.0.1", int(r.get("port", 30033))), timeout=10)
                s.sendall(r["ftkey"].encode() + data)
                s.close()
            except Exception as e:
                log("icon", iid, e)

    def ensure_voice_channels(self):
        """«Привязка» и «Телепорт» сразу под «Лобби» — создаём, если их нет; значки и описания обновляем."""
        self.upload_icons()
        prev = self.cid[LOBBY]
        for name, topic, desc, icon in ((BIND, BIND_TOPIC, BIND_DESC, "bind"), (TELEPORT, TELEPORT_TOPIC, TELEPORT_DESC, "teleport")):
            cid = self.cid.get(name)
            if not cid:
                cid = self.ts.cmd("channelcreate channel_name=%s channel_flag_permanent=1 channel_order=%s channel_codec=4"
                                  " channel_codec_quality=10" % (esc(name), prev))[0]["cid"]
                self.ts.cmd("clientmove clid=%s cid=%s" % (self.me, self.cid[LOBBY]))
                log("channel", name, "created")
            # в обоих каналах не разговаривают: это место привязки и ожидания, голос — в комнате команды
            for edit in ("channel_topic=" + esc(topic), "channel_description=" + esc(desc), "channel_needed_talk_power=%d" % SILENT_TALK_POWER):
                try:
                    self.ts.cmd("channeledit cid=%s %s" % (cid, edit))
                except Exception as e:
                    log("channel edit", name, e)
            self.ts.cmd("channeladdperm cid=%s permsid=i_icon_id permvalue=%d|permsid=i_channel_needed_permission_modify_power permvalue=100"
                        "|permsid=i_channel_needed_delete_power permvalue=100" % (cid, ICONS[icon][0]))
            prev = cid
        self.refresh()

    @property
    def icon_match(self):
        try:
            return int(json.load(open(ICON_IDS))["c_tour"])
        except Exception:
            return 0

    def move(self, c, cid):
        self.ts.cmd("clientmove clid=%s cid=%s" % (c["clid"], cid))
        c["cid"] = cid

    def sync_rooms(self, rooms, clients, tele):
        """Комнаты команд под «Свои комнаты» — по списку сайта. Возвращает {идентификатор игрока: канал его команды}."""
        parent = self.cid.get(ROOMS) or tele
        want = {r["key"]: r for r in rooms if r.get("key") and r.get("name")}
        have = {}
        for ch in self.chans:
            topic = ch.get("channel_topic", "")
            if topic.startswith(ROOM_TOPIC):
                have[topic[len(ROOM_TOPIC):]] = ch["cid"]
        # игра закончилась — всех обратно в «Телепорт», комнату удаляем (не сразу: сайт мог ответить неполно)
        for key, cid in list(have.items()):
            if key in want:
                self.room_gone.pop(key, None)
                continue
            self.room_gone[key] = self.room_gone.get(key, 0) + 1
            if self.room_gone[key] < ROOM_GRACE:
                continue
            for c in clients:
                if c["cid"] == cid:
                    try:
                        self.move(c, tele)
                    except Exception as e:
                        log("room leave", e)
            try:
                self.ts.cmd("channeldelete cid=%s force=1" % cid)
                log("match room closed", self.cname.get(cid, cid))
            except Exception as e:
                log("room delete", e)
            del have[key]
            self.room_gone.pop(key, None)
        for key, r in want.items():
            name = r["name"][:40]
            cid = have.get(key)
            if not cid:
                try:
                    cid = self.ts.cmd("channelcreate channel_name=%s cpid=%s channel_flag_permanent=1 channel_codec=4 channel_codec_quality=10"
                                      " channel_topic=%s channel_description=%s" % (esc(name), parent, esc(ROOM_TOPIC + key), esc(ROOM_DESC)))[0]["cid"]
                except QueryError as e:
                    log("room create", name, e)
                    continue
                self.ts.cmd("clientmove clid=%s cid=%s" % (self.me, self.cid[LOBBY]))
                perms = "permsid=i_channel_needed_join_power permvalue=%d|permsid=i_channel_needed_permission_modify_power permvalue=100" % ROOM_JOIN_POWER
                if self.icon_match:
                    perms += "|permsid=i_icon_id permvalue=%d" % self.icon_match
                try:
                    self.ts.cmd("channeladdperm cid=%s %s" % (cid, perms))
                except Exception as e:
                    log("room perms", e)
                have[key] = cid
                self.cname[cid] = name
                self.cid[name] = cid
                log("match room", name)
            elif self.cname.get(cid) != name:
                try:
                    self.ts.cmd("channeledit cid=%s channel_name=%s" % (cid, esc(name)))
                    self.cname[cid] = name
                except Exception as e:
                    log("room rename", e)
        self.voice_cids = {tele, self.cid.get(BIND)} | set(have.values())
        return {uid: have[key] for key, r in want.items() if key in have for uid in r.get("uids", [])}

    def voice_tick(self, clients):
        bind, tele = self.cid.get(BIND), self.cid.get(TELEPORT)
        if not bind or not tele:
            return
        res = self.site("sync", clients=[{"uid": c["client_unique_identifier"], "nick": c["client_nickname"]}
                                         for c in clients if c["client_nickname"] not in SKIP_NICKS])
        if not res or "links" not in res:
            return
        links = {x["uid"]: x.get("nickname") or "профиль" for x in res.get("links", [])}
        self.refresh()
        room_of = self.sync_rooms(res.get("rooms", []), clients, tele)
        for c in clients:
            if c["client_nickname"] in SKIP_NICKS:
                continue
            uid, clid = c["client_unique_identifier"], c["clid"]
            try:
                if uid in links and self.described.get(clid) != links[uid]:
                    self.described[clid] = links[uid]
                    self.ts.cmd("clientedit clid=%s client_description=%s" % (clid, esc("Профиль F16 Arena: " + links[uid])))
                if c["cid"] == tele and uid not in links:
                    self.move(c, bind)
                    self.pm(clid, PM_NEED_BIND)
                if c["cid"] == bind:
                    if uid in links:
                        if self.bind_sent.pop(clid, None):
                            self.move(c, tele)
                            self.pm(clid, PM_LINKED % links[uid])
                            log("linked", c["client_nickname"], "->", links[uid])
                        else:
                            self.move(c, self.cid[LOBBY])
                            self.pm(clid, PM_ALREADY % links[uid])
                    elif time.time() - self.bind_sent.get(clid, 0) > LINK_TTL:
                        r = self.site("token", uid=uid, nick=c["client_nickname"])
                        if r and r.get("url"):
                            self.pm(clid, PM_LINK % r["url"])
                            # ссылку — ещё и всплывающим предупреждением: вкладку личных сообщений легко не заметить.
                            # В предупреждение помещается 100 знаков, поэтому там только сама ссылка
                            poke = "[URL]%s[/URL]" % r["url"]
                            if len(poke) > 100:
                                poke = "Ссылка привязки — во вкладке «F16 Bot» внизу окна"
                            try:
                                self.ts.cmd("clientpoke clid=%s msg=%s" % (clid, esc(poke)))
                            except Exception as e:
                                log("poke", e)
                            self.bind_sent[clid] = time.time()
                            log("link sent", c["client_nickname"])
                if c["cid"] == tele and uid in room_of:
                    room = room_of[uid]
                    self.move(c, room)
                    if self.room_told.get(clid) != room:
                        self.room_told[clid] = room
                        self.pm(clid, PM_ROOM % self.cname.get(room, "комната команды"))
            except Exception as e:
                log("voice", c["client_nickname"], e)
        waiting = {c["clid"] for c in clients if c["cid"] == bind}
        online = {c["clid"] for c in clients}
        self.bind_sent = {k: v for k, v in self.bind_sent.items() if k in waiting}
        self.described = {k: v for k, v in self.described.items() if k in online}
        self.room_told = {k: v for k, v in self.room_told.items() if k in online}

    # ── комнаты ──
    def make_room(self, client, name, maxclients=0):
        parent = self.cid.get(ROOMS)
        if not parent:
            return None
        name = name[:38]
        base, n = name, 2
        while name in self.cid:
            name = "%s %d" % (base, n); n += 1
        args = "channel_name=%s cpid=%s channel_codec=4 channel_codec_quality=10" % (esc(name), parent)
        if maxclients:
            args += " channel_flag_maxclients_unlimited=0 channel_maxclients=%d" % maxclients
        args += " channel_description=" + esc("Комната %s. Удалится сама, когда все выйдут.\n"
                                              "Владелец может переименовать и поставить пароль: ПКМ → «Изменить канал»." % client["client_nickname"])
        new = self.ts.cmd("channelcreate " + args)[0]["cid"]
        # создатель-бот оказался внутри — сначала переносим игрока, потом уходим сами, иначе комната удалится пустой
        self.ts.cmd("clientmove clid=%s cid=%s" % (client["clid"], new))
        self.ts.cmd("clientmove clid=%s cid=%s" % (self.me, self.cid[LOBBY]))
        admin = self.cgroups.get("Channel Admin")
        if admin:
            try:
                self.ts.cmd("setclientchannelgroup cgid=%s cid=%s cldbid=%s" % (admin, new, client["client_database_id"]))
            except Exception as e:
                log("channel admin", e)
        try:
            self.ts.cmd("channeladdperm cid=%s permsid=i_icon_id permvalue=%d" % (new, self.icon_rooms))
        except Exception:
            pass
        self.cid[name] = new; self.cname[new] = name
        log("room", name, "for", client["client_nickname"])
        return new, name

    @property
    def icon_rooms(self):
        return 480404243

    # ── команды ──
    def on_text(self, ev, by_clid):
        msg = ev.get("msg", "").strip()
        clid = ev.get("invokerid")
        if not msg.startswith("!") or ev.get("invokeruid") == "serveradmin" or clid == self.me:
            return
        client = by_clid.get(clid)
        if not client:
            return
        cmd = msg.split()[0].lower()
        nick = client["client_nickname"]
        if cmd in ("!помощь", "!help", "!команды", "!бот"):
            self.pm(clid, HELP)
        elif cmd in ("!комната", "!room"):
            r = self.make_room(client, "Комната " + nick)
            if r:
                self.pm(clid, "Готово — ты в комнате «%s». Позови друзей, она удалится сама, когда все выйдут." % r[1])
        elif re.fullmatch(r"!([1-5])[xх]([1-5])", cmd) or cmd.startswith("!сбор"):
            m = re.fullmatch(r"!([1-5])[xх]([1-5])", cmd)
            n = int(m.group(1)) if m else 5
            label = "%dx%d" % (n, n)
            r = self.make_room(client, "%s · %s" % (label, nick), maxclients=n)
            if r:
                self.say("[b]%s[/b] собирает команду %s — заходи: [url=channelid://%s]%s[/url]" % (nick, label, r[0], r[1]))
        elif cmd in ("!привязка", "!привязать", "!телепорт", "!link"):
            self.pm(clid, PM_BIND_HELP)
        elif cmd in ("!отвязать", "!unlink"):
            r = self.site("unlink", uid=client["client_unique_identifier"])
            self.described.pop(clid, None)
            self.pm(clid, "Привязка снята. Привязать снова — зайди в канал «Привязка»." if r else "Сайт сейчас не отвечает — попробуй через минуту.")
        elif cmd in ("!онлайн", "!online", "!кто"):
            by = {}
            for c in by_clid.values():
                if c["client_nickname"] not in SKIP_NICKS:
                    by.setdefault(self.cname.get(c["cid"], "?"), []).append(c["client_nickname"])
            lines = ["[b]%s[/b]: %s" % (ch, ", ".join(sorted(n))) for ch, n in sorted(by.items())]
            self.pm(clid, "[b]Сейчас на сервере %d[/b]\n%s" % (sum(len(v) for v in by.values()), "\n".join(lines)))
        elif cmd in ("!ранг", "!rank", "!время"):
            sec = self.ranks.get(client["client_unique_identifier"], 0)
            cur = next((n for t, n in reversed(RANKS) if sec >= t), None)
            nxt = next(((t, n) for t, n in RANKS if sec < t), None)
            text = "Ты провёл на сервере [b]%s ч[/b]." % hours(sec)
            text += " Ранг: [b]%s[/b]." % cur if cur else " Ранга пока нет."
            if nxt:
                text += " До «%s» — %s ч." % (nxt[1], hours(nxt[0] - sec))
            self.pm(clid, text)
        elif cmd in ("!бронь", "!booking"):
            self.pm(clid, "Бронь ПК и PlayStation: [url=%s]f16-arena.kz[/url] → «Забронировать». Клуб работает 24/7." % SITE)
        elif cmd in ("!турнир", "!турниры", "!tournament"):
            self.pm(clid, "Турниры F16 Arena: [url=https://tournament.f16-arena.kz]tournament.f16-arena.kz[/url]")
        elif cmd == "!afk" and self.cid.get(AFK_NAME):
            self.ts.cmd("clientmove clid=%s cid=%s" % (clid, self.cid[AFK_NAME]))
        else:
            self.pm(clid, "Не знаю такую команду. Напиши [b]!помощь[/b].")

    # ── ранги ──
    def load_ranks(self):
        try:
            return json.load(open(RANKS_FILE, encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def tick_ranks(self, clients, dt):
        rank_ids = {self.groups.get(n) for _, n in RANKS} - {None}
        for c in clients:
            if c["client_nickname"] in SKIP_NICKS or self.cname.get(c["cid"]) == AFK_NAME or c.get("client_away") == "1":
                continue
            uid = c["client_unique_identifier"]
            sec = self.ranks.get(uid, 0) + dt
            self.ranks[uid] = sec
            self.ranks_dirty = True
            want = next((self.groups.get(n) for t, n in reversed(RANKS) if sec >= t), None)
            have = set(c.get("client_servergroups", "").split(",")) & rank_ids
            if want and want not in have:
                for g in have:
                    self.ts.cmd("servergroupdelclient sgid=%s cldbid=%s" % (g, c["client_database_id"]))
                self.ts.cmd("servergroupaddclient sgid=%s cldbid=%s" % (want, c["client_database_id"]))
                name = next(n for _, n in RANKS if self.groups.get(n) == want)
                self.pm(c["clid"], "Новый ранг: [b]%s[/b]! Спасибо, что ты с нами." % name)
                log("rank", c["client_nickname"], name)

    # ── основной цикл ──
    def run(self):
        last_slow, last_refresh, last_save, last_voice = 0, time.time(), time.time(), 0
        while True:
            now = time.time()
            if now - last_refresh > 60:
                self.refresh(); last_refresh = now
            clients = self.clients()
            by_clid = {c["clid"]: c for c in clients}

            # входящие команды (notify-строки копятся, пока идут обычные запросы)
            while self.ts.events:
                line = self.ts.events.pop(0)
                if line.startswith("notifytextmessage"):
                    ev = parse(line.partition(" ")[2])[0]
                    try:
                        self.on_text(ev, by_clid)
                    except Exception as e:
                        log("command error", e)

            # «+ Создать комнату»
            create = self.cid.get(CREATE)
            for c in clients:
                if create and c["cid"] == create:
                    try:
                        self.make_room(c, "Комната " + c["client_nickname"])
                    except Exception as e:
                        log("room error", e)
                        self.refresh()

            # привязка профиля и комнаты команд — по ответу сайта
            bind, tele = self.cid.get(BIND), self.cid.get(TELEPORT)
            every = SYNC_FAST if any(c["cid"] == bind for c in clients) else SYNC_TELE if any(c["cid"] == tele for c in clients) else SYNC
            if now - last_voice >= every:
                last_voice = now
                try:
                    self.voice_tick(clients)
                except ConnectionError:
                    raise
                except Exception as e:
                    log("voice error", e)

            # приветствие — только при первом заходе на сервер
            ids = set(by_clid)
            if self.seen is not None:
                for clid in ids - self.seen:
                    c = by_clid[clid]
                    try:
                        if self.ts.cmd("clientinfo clid=" + clid)[0].get("client_totalconnections") == "1":
                            self.pm(clid, WELCOME % c["client_nickname"])
                            log("welcome", c["client_nickname"])
                    except Exception as e:
                        log("welcome error", e)
            self.seen = ids

            if now - last_slow >= SLOW:
                dt = min(SLOW, int(now - last_slow)) if last_slow else 0
                last_slow = now
                clients = self.clients()
                self.afk(clients)
                if dt:
                    self.tick_ranks(clients, dt)
                self.write_state(clients)
            if self.ranks_dirty and now - last_save > 60:
                write(RANKS_FILE, self.ranks); self.ranks_dirty = False; last_save = now
            time.sleep(FAST)

    def afk(self, clients):
        afk = self.cid.get(AFK_NAME)
        for c in clients:
            if not afk or self.cname.get(c["cid"]) in SKIP_CHANNELS or c["client_nickname"] in SKIP_NICKS:
                continue
            if c["cid"] in self.voice_cids:  # в «Привязке», «Телепорте» и комнатах команд молчат подолгу — это не AFK
                continue
            idle = int(c.get("client_idle_time", "0")) // 1000
            away = c.get("client_away") == "1"
            muted = c.get("client_output_muted") == "1"
            if (away and idle >= AWAY_AFTER) or (muted and idle >= MUTED_AFTER) or idle >= IDLE_AFTER:
                try:
                    self.ts.cmd("clientmove clid=%s cid=%s" % (c["clid"], afk))
                    self.pm(c["clid"], "Ты давно молчишь — перенёс в AFK. Вернуться: двойной клик по своему каналу.")
                    log("afk", c["client_nickname"], "from", self.cname.get(c["cid"]), "idle", idle)
                except Exception as e:
                    log("afk error", e)

    def write_state(self, clients):
        si = self.ts.cmd("serverinfo")[0]
        state = {
            "at": int(time.time()),
            "name": si.get("virtualserver_name"),
            "version": si.get("virtualserver_version", "").split(" ")[0],
            "uptime": int(si.get("virtualserver_uptime", 0)),
            "online": len(clients),
            "max": int(si.get("virtualserver_maxclients", 0)),
            "channels": len(self.chans),
            "ping": round(float(si.get("virtualserver_total_ping", 0) or 0)),
            "packetloss": round(100 * float(si.get("virtualserver_total_packetloss_total", 0) or 0), 2),
            "clients": [{
                "nick": c["client_nickname"], "channel": self.cname.get(c["cid"], ""),
                "idle": int(c.get("client_idle_time", "0")) // 1000, "country": c.get("client_country", ""),
                "away": c.get("client_away") == "1", "muted": c.get("client_output_muted") == "1",
            } for c in clients],
        }
        write(STATE, state)
        # публичное для сайта f16-arena.kz — только числа, без ников
        write(PUBLIC, {"online": state["online"], "max": state["max"], "at": state["at"]})


if __name__ == "__main__":
    while True:
        try:
            bot = Bot()
            try:
                bot.run()
            finally:
                if bot.ranks_dirty:
                    write(RANKS_FILE, bot.ranks)
        except Exception:
            log("ошибка, переподключение через 10 с\n" + traceback.format_exc())
            time.sleep(10)
