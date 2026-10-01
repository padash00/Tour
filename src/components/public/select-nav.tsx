"use client";

import { useRouter } from "next/navigation";

/** Выпадающий список-навигация: выбор значения сразу открывает нужный URL */
export function SelectNav({
  value,
  options,
  label,
}: {
  value: string;
  options: { value: string; label: string; href: string }[];
  label: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) router.push(o.href, { scroll: false });
      }}
      className="field w-auto min-w-[200px] pr-8 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
