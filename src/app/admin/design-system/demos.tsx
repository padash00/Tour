"use client";

import { Copy, Ellipsis, Link2, LogOut, Settings, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Radio,
  SearchInput,
  Segmented,
  Select,
  Sheet,
  Slider,
  Textarea,
  Timer,
  Toggle,
  Tooltip,
} from "@/components/ds";
import { useToast } from "@/components/toast";
import { ActivityPill } from "@/components/shell/activity";
import type { Activity } from "@/lib/activity";
import { ParticipationPanel, type TournamentLite, type TournamentMe } from "@/components/competition/tournament-viewer";

/** Поля во всех состояниях + живая проверка тега (имитация: «F16», «NAVI» заняты) */
export function FieldsDemo() {
  const [tag, setTag] = useState("");
  const [check, setCheck] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [q, setQ] = useState("");
  const [bo, setBo] = useState<1 | 3 | 5>(3);
  const [on, setOn] = useState(true);
  const [money, setMoney] = useState(800);

  useEffect(() => {
    if (tag.trim().length < 2) return;
    const start = setTimeout(() => setCheck("checking"), 0);
    const done = setTimeout(() => setCheck(["F16", "NAVI"].includes(tag.trim().toUpperCase()) ? "taken" : "free"), 700);
    return () => {
      clearTimeout(start);
      clearTimeout(done);
    };
  }, [tag]);
  const shown = tag.trim().length < 2 ? "idle" : check;

  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      <Field label="Название команды" hint="От 2 до 32 символов" required>
        {(p) => <Input {...p} placeholder="Next Level" />}
      </Field>
      <Field
        label="Тег (живая проверка)"
        checking={shown === "checking" ? "Проверяем…" : undefined}
        success={shown === "free" ? "Тег свободен" : undefined}
        error={shown === "taken" ? "Тег уже используется" : undefined}
        hint="Попробуйте F16 или NAVI"
      >
        {(p) => <Input {...p} value={tag} onChange={(e) => setTag(e.target.value.slice(0, 6))} placeholder="NEXT" state={shown === "taken" ? "error" : shown === "free" ? "success" : undefined} />}
      </Field>
      <Field label="Регион">
        {(p) => (
          <Select {...p} defaultValue="kz">
            <option value="kz">Казахстан</option>
            <option value="ru">Россия</option>
            <option value="uz">Узбекистан</option>
          </Select>
        )}
      </Field>
      <Field label="Недоступно">{(p) => <Input {...p} disabled value="Состав заблокирован турниром" readOnly />}</Field>
      <Field label="Описание" className="md:col-span-2">
        {(p) => <Textarea {...p} placeholder="Пара слов о команде" />}
      </Field>
      <Field label="Поиск" hint="Подпись связана с полем через id">
        {(p) => <SearchInput {...p} value={q} onChange={setQ} loading={q.length > 0 && q.length < 3} placeholder="Игроки, команды, турниры" />}
      </Field>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px]">Best of</span>
          <Segmented label="Best of" value={bo} onChange={setBo} options={[1, 3, 5].map((n) => ({ value: n as 1 | 3 | 5, label: n }))} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px]">Овертаймы</span>
          <Toggle label="Овертаймы" on={on} onChange={setOn} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px]">Начальные деньги</span>
          <Slider label="Начальные деньги" value={money} min={0} max={16000} step={100} prefix="$" onChange={setMoney} />
        </div>
      </div>
      <div className="space-y-3">
        <Checkbox label="Нож перед картой" description="Победитель ножа выбирает сторону" defaultChecked />
        <Checkbox label="Только в голову" />
        <Checkbox label="Недоступно" disabled />
      </div>
      <div className="space-y-3">
        <Radio name="vis" label="Открытое" description="Видно в списке, вход без пароля" defaultChecked />
        <Radio name="vis" label="Закрытое" description="Видно в списке, вход по паролю" />
        <Radio name="vis" label="Приватное" description="Не в списке, вход по приглашению" />
      </div>
    </div>
  );
}

export function ButtonStatesDemo() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        loading={loading}
        done={done}
        onClick={() => {
          setLoading(true);
          setTimeout(() => {
            setLoading(false);
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          }, 1200);
        }}
      >
        {done ? "Отправлено" : loading ? "Отправляем…" : "Нажмите: loading → done"}
      </Button>
      <Button disabled>Недоступно</Button>
      <Button variant="secondary" disabled>
        Недоступно
      </Button>
    </div>
  );
}

export function OverlaysDemo() {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [banning, setBanning] = useState(false);
  const [tab, setTab] = useState("general");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => setDialog(true)} icon={<UserPlus />}>
        Dialog — пригласить игрока
      </Button>
      <Button variant="secondary" onClick={() => setSheet(true)} icon={<Settings />}>
        Sheet — настройки матча
      </Button>
      <Button variant="danger" onClick={() => setConfirm(true)}>
        Confirm — бан карты
      </Button>
      <Menu
        trigger={
          <IconButton label="Действия" variant="secondary">
            <Ellipsis />
          </IconButton>
        }
      >
        <MenuItem icon={<Copy />} onSelect={() => toast.success("Код скопирован")}>
          Скопировать код
        </MenuItem>
        <MenuItem icon={<Link2 />} onSelect={() => toast.success("Приглашение скопировано")}>
          Скопировать приглашение
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<LogOut />} danger onSelect={() => toast.info("Вы вышли из лобби")}>
          Покинуть лобби
        </MenuItem>
      </Menu>
      <Tooltip text="Рейтинг считается по последним 20 картам">
        <Button variant="ghost">Наведите — тултип</Button>
      </Tooltip>
      <Button variant="ghost" onClick={() => toast.success("Ссылка скопирована")}>
        Toast
      </Button>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Пригласить игрока"
        description="Любой, у кого есть ссылка, сможет вступить в команду, пока в ней есть места."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Закрыть
            </Button>
            <Button icon={<Copy />} onClick={() => (toast.success("Ссылка скопирована"), setDialog(false))}>
              Скопировать ссылку
            </Button>
          </>
        }
      >
        <Field label="Ссылка-приглашение" hint="Новая ссылка отключит эту — предыдущая перестанет работать.">
          {(p) => <Input {...p} readOnly value="https://tournament.f16-arena.kz/join/A7F2K9" className="num" />}
        </Field>
      </Dialog>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Настройки матча"
        description="Меняет только хост, до старта матча"
        nav={
          <div className="flex gap-1 overflow-x-auto">
            {[
              ["general", "Основные"],
              ["maps", "Карты"],
              ["gameplay", "Геймплей"],
              ["lobby", "Лобби"],
              ["advanced", "Дополнительно"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`h-11 shrink-0 border-b-2 px-3 text-[14px] font-medium ${tab === k ? "border-accent text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
              >
                {l}
              </button>
            ))}
          </div>
        }
        footer={
          <Button block onClick={() => setSheet(false)}>
            Готово
          </Button>
        }
      >
        <p className="text-[14px] text-fg-2">Раздел: {tab}. Здесь будут настройки раздела — без одной бесконечной простыни.</p>
      </Sheet>

      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        title="Забанить Mirage?"
        confirmLabel="Забанить Mirage"
        danger
        loading={banning}
        onConfirm={() => {
          setBanning(true);
          setTimeout(() => {
            setBanning(false);
            setConfirm(false);
            toast.success("Mirage забанена");
          }, 800);
        }}
      />
    </div>
  );
}

/** Таймер: дедлайн считается в браузере, чтобы не было расхождения разметки */
export function TimerDemo() {
  const [deadline] = useState(() => new Date(Date.now() + 24_000).toISOString());
  const [long] = useState(() => new Date(Date.now() + 18 * 60_000 + 42_000).toISOString());
  return (
    <div className="flex flex-wrap items-end gap-10">
      <div>
        <div className="text-meta text-fg-3">Ход в вето (красный с 10 с)</div>
        <Timer deadline={deadline} className="text-[32px] font-semibold" />
      </div>
      <div>
        <div className="text-meta text-fg-3">Check-in закроется через</div>
        <Timer deadline={long} urgentAt={120} className="text-[32px] font-semibold" />
      </div>
    </div>
  );
}

/** Глобальная активность шапки: все виды по приоритету (дедлайны считаются в браузере) */
export function ActivityDemo() {
  const [now] = useState(() => Date.now());
  const at = (s: number) => new Date(now + s * 1000).toISOString();
  const base = { href: "/admin/design-system", connect: null, deadline: null } as const;
  const list: { a: Activity; more?: number; note: string }[] = [
    { a: { ...base, kind: "veto_turn", priority: 1, label: "Ваш ход · бан карты", detail: "Вето матча #12 против F16 Wolves", tone: "accent", deadline: at(42), key: "1" }, more: 1, note: "1 · ваш ход (вето турнира / лобби, драфт) — секунды" },
    { a: { ...base, kind: "lobby_draft_turn", priority: 1, label: "Ваш ход · драфт", detail: "Лобби #A7F2K9 — выберите игрока", tone: "accent", deadline: at(25), key: "2" }, note: "1 · драфт лобби" },
    { a: { ...base, kind: "lobby_ready_check", priority: 2, label: "Проверка готовности", detail: "Лобби #A7F2K9 — подтвердите, что вы на месте", tone: "warn", deadline: at(28), key: "3" }, note: "2 · проверка готовности — 30 секунд" },
    { a: { ...base, kind: "server_ready", priority: 3, label: "Сервер готов", detail: "Матч #12 против F16 Wolves", tone: "ok", connect: "192.168.0.159:27015", key: "4" }, note: "3 · сервер готов — подключение в один клик" },
    { a: { ...base, kind: "checkin", priority: 4, label: "Check-in открыт", detail: "F16 Open #01 — подтвердите участие команды", tone: "warn", deadline: at(18 * 60 + 40), key: "5" }, note: "4 · check-in (капитан) — десятки минут" },
    { a: { ...base, kind: "live", priority: 5, label: "Ваш матч идёт", detail: "Матч #12 против F16 Wolves", tone: "live", key: "6" }, note: "5 · ваш матч идёт" },
  ];
  return (
    <div className="divide-y divide-line-subtle rounded-surface border border-line-subtle bg-shell">
      {list.map((x) => (
        <div key={x.a.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-meta text-fg-3">{x.note}</span>
          <ActivityPill activity={x.a} more={x.more} />
        </div>
      ))}
    </div>
  );
}

/** Панель участия турнира — все состояния участника (без запросов) */
export function ParticipationDemo() {
  const t = (status: TournamentLite["status"]): TournamentLite => ({
    id: "demo",
    slug: "f16-open-01",
    name: "F16 Open #01",
    status,
    format: "5v5",
    max_teams: 16,
    registration_closes_at: "2026-10-09T18:00:00Z",
    checkin_opens_at: "2026-10-10T05:00:00Z",
    checkin_closes_at: "2026-10-10T05:45:00Z",
  });
  const team = (mains: number) => ({ id: "x", name: "Next Level", captain_id: "c", mains, solo: false });
  const reg = (status: "pending" | "approved" | "rejected", checked = false, note: string | null = null) => ({ status, checked_in_at: checked ? "2026-10-10T05:10:00Z" : null, note, created_at: "2026-10-03T12:00:00Z" });
  const me = (o: Partial<TournamentMe>): TournamentMe => ({ loggedIn: true, isAdmin: false, team: null, isCaptain: true, reg: null, ...o });
  const cases: { note: string; t: TournamentLite; me: TournamentMe }[] = [
    { note: "Гость", t: t("registration"), me: { loggedIn: false, isAdmin: false, team: null, isCaptain: false, reg: null } },
    { note: "Нет команды", t: t("registration"), me: me({}) },
    { note: "Состав неполный", t: t("registration"), me: me({ team: team(3) }) },
    { note: "Команда готова (капитан)", t: t("registration"), me: me({ team: team(5) }) },
    { note: "Команда готова (игрок)", t: t("registration"), me: me({ team: team(5), isCaptain: false }) },
    { note: "Заявка на рассмотрении", t: t("registration"), me: me({ team: team(5), reg: reg("pending") }) },
    { note: "Заявка одобрена → check-in", t: t("registration_closed"), me: me({ team: team(5), reg: reg("approved") }) },
    { note: "Заявка отклонена", t: t("registration"), me: me({ team: team(5), reg: reg("rejected", false, "Игрок ALTX_F4 заявлен за другую команду") }) },
    { note: "Check-in открыт", t: t("checkin"), me: me({ team: team(5), reg: reg("approved") }) },
    { note: "Check-in пройден", t: t("checkin"), me: me({ team: team(5), reg: reg("approved", true) }) },
    { note: "Турнир идёт (участник)", t: t("live"), me: me({ team: team(5), reg: reg("approved", true) }) },
    { note: "Регистрация закрыта (не участник)", t: t("registration_closed"), me: me({ team: team(5) }) },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cases.map((c) => (
        <div key={c.note}>
          <div className="mb-2 text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{c.note}</div>
          <ParticipationPanel t={c.t} approvedCount={11} preview={c.me} />
        </div>
      ))}
    </div>
  );
}
