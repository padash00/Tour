/** Структурированные данные schema.org для поисковиков. `<` экранируется — данные (названия команд) приходят от пользователей */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c") }} />;
}
