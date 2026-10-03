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
