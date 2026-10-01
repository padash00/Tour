import type { Metadata } from "next";
import { Button, Card, Notice, Pill } from "@/components/ui";
import { SERVER_PLAN } from "./plan";

export const metadata: Metadata = { title: "Серверы" };

const CHECKS = ["Process", "CS2", "MatchZy", "F16Stats", "Map", "Roster", "Password", "Server responding"];

export default function ServersPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="label">Инфраструктура</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Серверы</h1>
      </div>

      <Notice tone="warn">
        F16 Server Agent ещё не подключён. Ниже — план инстансов. Управление (start / stop / restart, загрузка матча,
        health check) заработает на этапе 3, когда агент на серверном ПК установит соединение с платформой.
      </Notice>

      <div className="card overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead>
            <tr>
              <th>Инстанс</th>
              <th>Адрес</th>
              <th>Состояние</th>
              <th>Матч</th>
              <th>Карта</th>
              <th className="text-right">Игроки</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {SERVER_PLAN.map((s) => (
              <tr key={s.name}>
                <td className="font-semibold text-fg num">{s.name}</td>
                <td className="num text-[13px]">LAN :{s.port}</td>
                <td>{s.reserve ? <Pill>Standby</Pill> : <Pill tone="danger" dot>Offline</Pill>}</td>
                <td className="text-fg-3">—</td>
                <td className="text-fg-3">—</td>
                <td className="text-right num text-fg-3">0/10</td>
                <td className="text-right">
                  <div className="inline-flex gap-1.5">
                    <Button variant="secondary" size="sm" disabled>
                      Restart
                    </Button>
                    <Button variant="ghost" size="sm" disabled>
                      Логи
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="p-6">
        <div className="label mb-4">Health check перед выдачей IP</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CHECKS.map((c) => (
            <div key={c} className="flex items-center gap-2 h-10 px-3 rounded-lg border border-line bg-bg-2 text-sm text-fg-3">
              <span className="size-1.5 rounded-full bg-fg-3" />
              {c}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
