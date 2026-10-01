import { Eyebrow, OutlineBtn, PrimaryBtn, WRAP } from "@/components/primitives";

export default function NotFound() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_80%_-10%,#16253d80,transparent_70%)]" />
      <div className={`${WRAP} relative py-32 lg:py-44`}>
        <Eyebrow>Ошибка 404</Eyebrow>
        <h1 className="t-display mt-5">Страница не найдена</h1>
        <p className="mt-6 text-[17px] lg:text-[20px] text-fg-2">Ссылка устарела или страница удалена.</p>
        <div className="mt-12 flex flex-wrap gap-4">
          <PrimaryBtn href="/">На главную</PrimaryBtn>
          <OutlineBtn href="/tournaments">Турниры</OutlineBtn>
        </div>
      </div>
    </section>
  );
}
