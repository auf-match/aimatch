"use client";

/**
 * Прототип звука нажатия. Не подключён к приложению — живёт отдельной
 * страницей, чтобы подобрать параметры до раскатки.
 *
 * Звучат только основные (оранжевые) кнопки: variant default и accent
 * компонента Button, которые получают data-click-sound автоматически.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ClickSoundProvider } from "@/components/click-sound-provider";

function Slider({
  label, value, min, max, step, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-[12px] mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#F97029]"
      />
      <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
    </label>
  );
}

export default function ClickSoundPrototype() {
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(0.4);
  const [rate, setRate] = useState(1);
  const [maxMs, setMaxMs] = useState(0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ClickSoundProvider
        enabled={enabled}
        volume={volume}
        rate={rate}
        maxMs={maxMs}
      />

      <div className="mx-auto max-w-[900px] px-6 py-12 space-y-8">
        <header>
          <h1 className="text-2xl font-bold mb-1">Звук нажатия — прототип</h1>
          <p className="text-sm text-muted-foreground">
            Основные кнопки играют твой файл. Остальное — процедурные пресеты
            из{" "}
            <a
              href="https://github.com/mishanaer/sound"
              target="_blank"
              rel="noreferrer"
              className="underline"
              data-click-sound="false"
            >
              mishanaer/sound
            </a>
            : синтезируются на лету, без файлов.
          </p>
        </header>

        {/* Настройки */}
        <section className="rounded-lg border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Настройки</span>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-[#F97029]"
              />
              Звук включён
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Slider
              label="Громкость" value={volume} min={0} max={1} step={0.05}
              onChange={setVolume}
              hint="0.3–0.5 обычно достаточно: звук подтверждает, а не заявляет о себе"
            />
            <Slider
              label="Скорость" value={rate} min={0.5} max={2.5} step={0.1}
              onChange={setRate}
              hint="Выше 1 — щелчок короче и суше. Исходный файл длинный для клика"
            />
            <Slider
              label="Обрезка, мс" value={maxMs} min={0} max={650} step={10}
              onChange={setMaxMs}
              hint="0 — целиком (620 мс). Для интерфейса обычно хватает 80–150"
            />
          </div>

          <p className="text-[12px] text-muted-foreground border-t border-border pt-3">
            Подобранные значения скажи — вшью как значения по умолчанию.
          </p>
        </section>

        {/* Звучит */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Звучит — основное действие</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Сохранить</Button>
            <Button variant="accent">Запустить матчинг</Button>
            <Button size="lg">Крупная основная</Button>
            <Button size="sm">Мелкая основная</Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Пометка проставляется в компоненте Button для оранжевых вариантов —
            руками ничего размечать не нужно.
          </p>
        </section>

        {/* Все пресеты */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Все семь пресетов набора</h2>
          <div className="flex flex-wrap gap-2">
            {(["press", "click", "tap", "hover", "select", "toggle", "tick"] as const).map(
              (preset) => (
                <button
                  key={preset}
                  data-click-sound={preset}
                  className="rounded-md border border-border px-3 py-2 font-mono text-[12px] hover:border-foreground/30 transition-colors"
                >
                  {preset}
                </button>
              ),
            )}
          </div>
          <p className="text-[12px] text-muted-foreground">
            Разница тонкая — они намеренно едва заметные. Каждый щелчок звучит
            чуть иначе: набор подмешивает случайность, чтобы не было эффекта
            заезженной пластинки.
          </p>
        </section>

        {/* Процедурные — по умолчанию */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">
            Остальные элементы — процедурный звук
          </h2>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline">Отмена</Button>
            <Button variant="ghost">Текстовая</Button>
            <Button variant="secondary">Вторичная</Button>
            <Button variant="tinted">Акцентная светлая</Button>
            <Button variant="destructive">Удалить</Button>
            <Button variant="link">Ссылка</Button>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <a href="#" onClick={(e) => e.preventDefault()} className="text-sm underline">
              Обычная ссылка
            </a>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-[#F97029]" /> Чекбокс
            </label>
            <select className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option>Селект</option>
              <option>Второй пункт</option>
            </select>
            <input
              type="text"
              placeholder="Текстовое поле"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <p className="text-[12px] text-muted-foreground">
            Чекбоксы и переключатели — <code className="text-[11px]">toggle</code>,
            селекты — <code className="text-[11px]">select</code>, раскрывающиеся
            блоки — <code className="text-[11px]">press</code>, остальные кнопки
            и ссылки — <code className="text-[11px]">click</code>.
          </p>

          <details className="rounded-md border border-border px-4 py-3 text-sm">
            <summary className="cursor-pointer">Раскрывающийся блок — press</summary>
            <p className="mt-2 text-muted-foreground">Содержимое.</p>
          </details>

          <div className="grid gap-3 sm:grid-cols-3">
            {["Карточка кандидата", "Карточка вакансии", "Этап воронки"].map((title) => (
              <div
                key={title}
                role="button"
                tabIndex={0}
                className="rounded-lg border border-border p-4 cursor-pointer hover:border-foreground/30 transition-colors"
              >
                <p className="text-sm font-medium">{title}</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  role=&quot;button&quot; → click
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Молчит */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Молчит</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Текстовое поле"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Многострочное"
              rows={1}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
            />
            <span className="text-[12px] text-muted-foreground">
              Клик ставит курсор, а не нажимает
            </span>
          </div>
        </section>

        {/* Крайние случаи */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Отдельные случаи</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Заблокированная основная</Button>
            <Button data-click-sound="false">Основная без звука</Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Заблокированная молчит: звук обещает действие, а клик ничего не
            делает. Снять звук с конкретной кнопки —{" "}
            <code className="text-[11px]">data-click-sound=&quot;false&quot;</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
