import type { Metadata } from "next";
import { editWorkshopMaps, saveSetting } from "@/app/actions/admin-settings";
import { getSettingsStatus, getWorkshopMaps } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const [settings, workshop] = await Promise.all([getSettingsStatus(), getWorkshopMaps()]);
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <div className="label">Платформа</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Настройки</h1>
        <p className="mt-2 text-sm text-fg-3">
          Ключи хранятся в базе и читаются только сервером сайта. Значения не показываются целиком и не пишутся в журнал.
        </p>
      </div>
      <Card className="p-6">
        <div className="font-semibold">Карты из Steam Workshop</div>
        <div className="mt-1 text-xs text-fg-3">
          Например aim_map для дуэлей. Добавьте один раз — карта появится плиткой в форме любого турнира. Сервер скачивает её сам по ID.
        </div>
        {workshop.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {workshop.map((w) => (
              <ActionForm key={w} action={editWorkshopMaps}>
                <input type="hidden" name="remove" value={w} />
                <span className="h-9 pl-3 pr-1 inline-flex items-center gap-2 rounded-lg border border-line bg-bg-2 text-sm">
                  {w.split("@")[0]}
                  <a
                    href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${w.split("@")[1]}`}
                    target="_blank"
                    rel="noreferrer"
                    className="num text-[11px] text-fg-3 hover:text-accent"
                  >
                    {w.split("@")[1]}
                  </a>
                  <SubmitButton variant="ghost" size="sm" confirm={`Убрать ${w.split("@")[0]} из библиотеки?`}>
                    ✕
                  </SubmitButton>
                </span>
              </ActionForm>
            ))}
          </div>
        )}
        <ActionForm action={editWorkshopMaps} className="mt-4">
          <div className="flex flex-wrap gap-2">
            <input name="name" placeholder="aim_map" className="field w-40" />
            <input name="link" placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=…" className="field flex-1 min-w-[240px] num" />
            <SubmitButton variant="secondary">Добавить карту</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {settings.map((s) => (
        <Card key={s.key} className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{s.label}</div>
              <div className="mt-1 text-xs text-fg-3">{s.hint}</div>
            </div>
            {s.source ? (
              <Pill tone="ok" dot>
                {s.source === "site" ? "задан" : "задан в Vercel"} {s.preview && <span className="num normal-case tracking-normal">{s.preview}</span>}
              </Pill>
            ) : (
              <Pill tone="warn" dot>не задан</Pill>
            )}
          </div>
          <ActionForm action={saveSetting} className="mt-4">
            <input type="hidden" name="key" value={s.key} />
            <div className="flex flex-wrap gap-2">
              <input
                name="value"
                type={s.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={s.source ? "Новое значение" : "Значение"}
                className="field num flex-1 min-w-[240px]"
              />
              <SubmitButton variant="secondary">Сохранить</SubmitButton>
              {s.source === "site" && (
                <SubmitButton variant="ghost" name="clear" value="1" confirm="Удалить значение?">
                  Удалить
                </SubmitButton>
              )}
            </div>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
