import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-32 md:py-40">
      <div className="num text-sm text-fg-3">404</div>
      <h1 className="mt-4 text-[40px] md:text-[56px] font-bold tracking-[-0.04em] leading-none">Страница не найдена</h1>
      <p className="mt-5 text-lg text-fg-2">Ссылка устарела или страница удалена.</p>
      <div className="mt-10">
        <ButtonLink href="/" variant="secondary">
          На главную
        </ButtonLink>
      </div>
    </Container>
  );
}
