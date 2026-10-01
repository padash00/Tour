"use client";

/** Ошибка в корневом layout: свои <html>/<body>, стили инлайн — globals.css тут может не загрузиться */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#070b12",
          color: "#f4f7fb",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.34em", textTransform: "uppercase", color: "#7f93b0" }}>F16 Arena</div>
          <h1 style={{ fontSize: 40, fontWeight: 600, margin: "20px 0 0" }}>Сайт временно недоступен</h1>
          <p style={{ color: "#a8b2c2", fontSize: 17, lineHeight: 1.6, marginTop: 20 }}>
            Мы уже видим ошибку. Обновите страницу через минуту.
          </p>
          {error.digest && <p style={{ color: "#687588", fontSize: 13 }}>Код: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 28,
              height: 52,
              padding: "0 32px",
              borderRadius: 8,
              border: 0,
              background: "#8ab8ff",
              color: "#07101b",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
