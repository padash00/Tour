import { toLocalInput } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { Card, Field } from "@/components/ui";

const DEFAULT_RULES = `Формат: Double Elimination, 16 команд.
BO1 до полуфиналов, полуфиналы и финал — BO3.

Вето проходит на странице матча до подключения к серверу.
На сервер допускаются только заявленные игроки (по SteamID).
Разминка: .ready / .r — матч стартует при 10/10 готовых.
Ножевой раунд: победитель выбирает сторону командой .stay или .switch.
Каждая карта записывается в демо.`;

export function TournamentForm({ action, t }: { action: FormAction; t?: Tournament }) {
  return (
    <ActionForm action={action} className="space-y-6">
      {t && <input type="hidden" name="id" value={t.id} />}

      <Card className="p-6 space-y-4">
        <div className="label">Основное</div>
        <div className="grid sm:grid-cols-[1.4fr_1fr] gap-4">
          <Field label="Название">
            <input name="name" required defaultValue={t?.name} placeholder="F16 Open Cup #1" className="field" />
          </Field>
          <Field label="Адрес страницы" hint="/tournaments/…">
            <input name="slug" required defaultValue={t?.slug} placeholder="f16-open-1" className="field num" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Режим">
            <input name="format" required defaultValue={t?.format ?? "5v5"} className="field" />
          </Field>
          <Field label="Сетка">
            <select name="bracket_type" defaultValue={t?.bracket_type ?? "double_elimination"} className="field">
              <option value="double_elimination">Double Elimination</option>
              <option value="single_elimination">Single Elimination</option>
            </select>
          </Field>
          <Field label="Максимум команд">
            <input name="max_teams" type="number" min={2} max={64} defaultValue={t?.max_teams ?? 16} className="field num" />
          </Field>
        </div>
        <Field label="Формат матчей">
          <input
            name="match_format"
            defaultValue={t?.match_format ?? "BO1 до полуфиналов · полуфиналы и финал BO3"}
            className="field"
          />
        </Field>
        <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <Field label="Площадка / город">
            <input name="location" defaultValue={t?.location ?? ""} placeholder="F16 Arena, Алматы" className="field" />
          </Field>
          <label className="flex items-center gap-2 h-[42px] text-sm text-fg-2">
            <input type="checkbox" name="is_lan" defaultChecked={t?.is_lan ?? true} className="size-4 accent-[#8bb8ff]" />
            LAN
          </label>
        </div>
        <Field label="Маппул" hint="Через пробел или запятую. Префикс de_ можно не писать.">
          <input
            name="map_pool"
            required
            defaultValue={(t?.map_pool ?? ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_dust2", "de_train"]).join(" ")}
            className="field num"
          />
        </Field>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="label">Даты · время Алматы (UTC+5)</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Регистрация открывается">
            <input type="datetime-local" name="registration_opens_at" defaultValue={toLocalInput(t?.registration_opens_at)} className="field" />
          </Field>
          <Field label="Регистрация закрывается">
            <input type="datetime-local" name="registration_closes_at" defaultValue={toLocalInput(t?.registration_closes_at)} className="field" />
          </Field>
          <Field label="Check-in с">
            <input type="datetime-local" name="checkin_opens_at" defaultValue={toLocalInput(t?.checkin_opens_at)} className="field" />
          </Field>
          <Field label="Check-in до">
            <input type="datetime-local" name="checkin_closes_at" defaultValue={toLocalInput(t?.checkin_closes_at)} className="field" />
          </Field>
          <Field label="Старт турнира">
            <input type="datetime-local" name="starts_at" defaultValue={toLocalInput(t?.starts_at)} className="field" />
          </Field>
        </div>
        <p className="text-xs text-fg-3">
          Даты отображаются участникам. Статус турнира (открыть регистрацию, check-in и т.д.) переключается вручную.
        </p>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="label">Призы</div>
        <Field label="Призовой фонд">
          <input name="prize_pool" defaultValue={t?.prize_pool ?? ""} placeholder="500 000 ₸" className="field" />
        </Field>
        <Field label="Распределение" hint="Каждое место с новой строки: «1 место — 300 000 ₸»">
          <textarea
            name="prizes"
            rows={4}
            defaultValue={t?.prize_distribution.map((p) => `${p.place} — ${p.prize}`).join("\n")}
            className="field num resize-y"
          />
        </Field>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="label">Тексты</div>
        <Field label="Описание">
          <textarea name="description" rows={4} defaultValue={t?.description ?? ""} className="field resize-y" />
        </Field>
        <Field label="Требования к участникам" hint="Если пусто — показываются стандартные">
          <textarea name="requirements" rows={4} defaultValue={t?.requirements ?? ""} className="field resize-y" />
        </Field>
        <Field label="Регламент">
          <textarea name="rules" rows={10} defaultValue={t?.rules ?? DEFAULT_RULES} className="field resize-y" />
        </Field>
      </Card>

      <SubmitButton size="lg">{t ? "Сохранить изменения" : "Создать черновик"}</SubmitButton>
    </ActionForm>
  );
}
