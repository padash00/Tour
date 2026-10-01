import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-32 text-center">
      <div className="num text-sm text-fg-3">404</div>
      <h1 className="mt-4 text-4xl font-bold tracking-[-0.03em]">Страница не найдена</h1>
      <p className="mt-4 text-fg-2">Возможно, ссылка устарела или страница была удалена.</p>
      <div className="mt-8">
        <ButtonLink href="/" variant="secondary">
          На главную
        </ButtonLink>
      </div>
    </Container>
  );
}
