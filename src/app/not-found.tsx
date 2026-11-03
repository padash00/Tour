import { Button, Container, Eyebrow } from "@/components/ds";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <section className="relative overflow-hidden">
      <Container className="relative py-28 sm:py-36 lg:py-44">
        <Eyebrow>{t("Ошибка 404")}</Eyebrow>
        <h1 className="mt-5 text-[40px] font-semibold leading-tight tracking-[-0.03em] text-fg sm:text-[56px]">{t("Страница не найдена")}</h1>
        <p className="mt-6 text-[17px] lg:text-[20px] text-fg-2">{t("Ссылка устарела или страница удалена.")}</p>
        <div className="mt-12 flex flex-wrap gap-4">
          <Button href="/" size="lg">{t("На главную")}</Button>
          <Button href="/tournaments" variant="secondary" size="lg">{t("Турниры")}</Button>
        </div>
      </Container>
    </section>
  );
}
