"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LANG, LANG_COOKIE, isLang, makeT, type Lang } from "@/lib/i18n/core";

/** Корневой layout недоступен — язык берём из cookie «lang», иначе язык по умолчанию */
function readLang(): Lang {
  const c = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`))?.[1];
  return isLang(c) ? c : DEFAULT_LANG;
}
const subscribe = () => () => {};

/** Ошибка в корневом layout: свои <html>/<body>, стили инлайн — globals.css тут может не загрузиться */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => DEFAULT_LANG);
  const t = makeT(lang);
  return (
    <html lang={lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f3f4f6",
          color: "#121417",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.34em", textTransform: "uppercase", color: "#6b727d" }}>F16 Arena</div>
          <h1 style={{ fontSize: 40, fontWeight: 600, margin: "20px 0 0" }}>{t("Сайт временно недоступен")}</h1>
          <p style={{ color: "#454b55", fontSize: 17, lineHeight: 1.6, marginTop: 20 }}>
            {t("Мы уже видим ошибку. Обновите страницу через минуту.")}
          </p>
          {error.digest && <p style={{ color: "#6b727d", fontSize: 13 }}>{t("Код: {code}", { code: error.digest })}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 28,
              height: 52,
              padding: "0 32px",
              borderRadius: 8,
              border: 0,
              background: "#5f9a00",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("Попробовать снова")}
          </button>
        </div>
      </body>
    </html>
  );
}
