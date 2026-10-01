import type { Metadata } from "next";
import { EmptyState, IconBracket } from "@/components/ui";

export const metadata: Metadata = { title: "Матчи" };

export default function AdminMatchesPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="label">Управление</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Матчи</h1>
      </div>
      <EmptyState
        icon={<IconBracket />}
        title="Матчей пока нет"
        description="Матчи создаются автоматически при публикации сетки (этап 2). Здесь будут статусы, назначенные серверы, ручной ввод результата, паузы и перенос на резервный сервер."
      />
    </div>
  );
}
