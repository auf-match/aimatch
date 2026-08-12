"use client";

/**
 * Прототип публичной страницы для дизайнеров.
 *
 * Данные подготовленные, анализ не запускается: цель — посмотреть экраны.
 * В бою страница живёт по адресу /p/portfolio без сайдбара и без пароля.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Screen = "form" | "waiting" | "result" | "error";

// ── Подготовленные данные разбора ────────────────────────────────────

const ANALYSIS = {
  name: "Марина Кузнецова",
  direction: "продуктовый дизайнер",
  overall:
    "Портфолио сильного визуального дизайнера с продуктовым уклоном. Экраны собраны цельно, визуальный язык узнаваем и держится по всему кейсу — включая служебные состояния, до которых обычно не доходят руки. Слабее там, где нужно объяснить ход мысли: решения показаны, но не обоснованы.",
  criteria: [
    ["Визуал", "Композиция и типографика на уверенном уровне. Язык не разваливается между экранами, детали поддерживают общий образ."],
    ["UX", "Флоу читаются, паттерны используются по назначению. Пустые состояния и ошибки проработаны не везде."],
    ["Продуктовое мышление", "Бизнес-задача обозначена в двух кейсах из трёх, но связь между ней и принятыми решениями не показана."],
    ["Системность", "Видно переиспользуемые компоненты и единые правила. Масштабируемость решений заявлена, но не показана на примере."],
    ["Аргументация", "Кейсы устроены как галерея результата. Гипотез, альтернатив и объяснения «почему так» почти нет."],
    ["Метрики и результат", "Ни в одном кейсе нет измеримого эффекта — даже приблизительного или качественного."],
    ["Глубина исследований", "Упоминаются интервью с пользователями, но не показано, как их выводы повлияли на макеты."],
  ] as [string, string][],
  strengths: [
    "Цельный визуальный язык, который держится по всему продукту",
    "Проработанные состояния интерфейса — загрузка, пустота, ошибки",
    "Плотные экраны с данными читаются легко",
  ],
  toImprove: [
    "Показать путь к решению, а не только итог: что пробовали и от чего отказались",
    "Добавить результат хотя бы качественно — что изменилось после запуска",
    "Связать исследования с макетами: какой вывод во что превратился",
  ],
  cases: [
    {
      title: "Редизайн онбординга",
      description: "Переработка первого запуска мобильного приложения сервиса доставки.",
      strengths: ["Последовательность экранов выстроена логично", "Хорошая работа с иллюстрациями внутри системы"],
      concerns: ["Не показано, что было до редизайна", "Неясно, почему выбран именно такой порядок шагов"],
    },
    {
      title: "Личный кабинет банка",
      description: "Кабинет для розничного банка: счета, переводы, история операций.",
      strengths: ["Плотные экраны с данными читаются легко", "Единая сетка выдержана по всем разделам"],
      concerns: ["Не ясно, какую задачу решал редизайн", "Нет ни одного слова о результате"],
    },
    {
      title: "Приложение доставки",
      description: "Мобильное приложение для курьеров: маршруты, статусы, связь с оператором.",
      strengths: ["Продуманы сценарии работы одной рукой", "Состояния заказа различимы с первого взгляда"],
      concerns: ["Показаны только финальные макеты", "Не хватает объяснения ограничений"],
    },
  ],
};

// ── Экран 1: форма ───────────────────────────────────────────────────

function FormScreen({ onSubmit }: { onSubmit: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [link, setLink] = useState("");
  const [agreed, setAgreed] = useState(false);

  const ready = name.trim() && contact.trim() && link.trim() && agreed;

  return (
    <div className="max-w-[560px]">
      <p className="t-eyebrow opacity-60 mb-3">АУФ · разбор портфолио</p>
      <h1 className="text-[26px] sm:text-[32px] font-bold leading-tight mb-3">
        Что видно в твоём портфолио со стороны
      </h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">
        Дизайн-лид агентства смотрит портфолио минуту и делает выводы, которые
        тебе никто не озвучит. Здесь эти выводы можно прочитать: что считывается
        как сильная сторона, а что мешает — по каждому кейсу отдельно.
      </p>

      <div className="space-y-4">
        <Field label="Как тебя зовут" value={name} onChange={setName} placeholder="Марина Кузнецова" />
        <Field
          label="Телеграм или почта"
          value={contact}
          onChange={setContact}
          placeholder="@marina или marina@mail.ru"
          hint="Понадобится, если под тебя появится подходящая вакансия"
        />
        <Field
          label="Ссылка на портфолио"
          value={link}
          onChange={setLink}
          placeholder="behance.net/… , notion.site/… , личный сайт"
        />

        <label className="flex gap-2.5 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-[#F97029] shrink-0"
          />
          <span className="text-[12.5px] text-muted-foreground leading-relaxed">
            Согласен на обработку персональных данных. Портфолио и контакт
            попадут в базу кандидатов агентства АУФ — мы напишем, если появится
            подходящая вакансия. Отозвать согласие можно письмом на почту.
          </span>
        </label>

        <div className="pt-2">
          <Button size="lg" disabled={!ready} onClick={onSubmit} className="w-full sm:w-auto">
            Разобрать портфолио
          </Button>
          <p className="text-[12px] text-muted-foreground mt-2.5">
            Разбор занимает 3–5 минут. Вкладку закрывать нельзя — результат
            останется здесь.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium mb-1.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3.5 py-3 text-base sm:py-2.5 sm:text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && <span className="block text-[12px] text-muted-foreground mt-1.5">{hint}</span>}
    </label>
  );
}

// ── Экран 2: ожидание ────────────────────────────────────────────────

function WaitingScreen() {
  const steps = [
    ["Открываем портфолио", "done"],
    ["Собираем кейсы", "done"],
    ["Смотрим экраны", "active"],
    ["Формулируем разбор", "wait"],
  ] as const;

  return (
    <div className="max-w-[560px]">
      <h1 className="text-[22px] sm:text-[26px] font-bold mb-2">Разбираем портфолио</h1>
      <p className="text-[14px] text-muted-foreground mb-8">
        Обычно занимает 3–5 минут. Не закрывай вкладку.
      </p>

      <div className="space-y-3">
        {steps.map(([label, state]) => (
          <div key={label} className="flex items-center gap-3">
            <span
              className={`h-5 w-5 shrink-0 rounded-full grid place-items-center text-[11px] ${
                state === "done"
                  ? "bg-[#F97029] text-white"
                  : state === "active"
                    ? "border-2 border-[#F97029]"
                    : "border border-border"
              }`}
            >
              {state === "done" ? "✓" : ""}
            </span>
            <span className={`text-sm ${state === "wait" ? "text-muted-foreground" : ""}`}>
              {label}
            </span>
            {state === "active" && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Экран 3: результат ───────────────────────────────────────────────

function ResultScreen() {
  const [openCase, setOpenCase] = useState<number | null>(1);

  return (
    <div className="max-w-[680px]">
      <p className="t-eyebrow opacity-60 mb-2">Разбор портфолио</p>
      <h1 className="text-[24px] sm:text-[28px] font-bold leading-tight">{ANALYSIS.name}</h1>
      <p className="text-[13px] text-muted-foreground mb-9">{ANALYSIS.direction}</p>

      <Section title="Общее впечатление">
        <p className="text-[15px] sm:text-[14px] leading-relaxed">{ANALYSIS.overall}</p>
      </Section>

      <Section title="Разбор по критериям">
        <div className="space-y-3.5">
          {ANALYSIS.criteria.map(([name, text]) => (
            <div key={name}>
              <div className="text-[14px] sm:text-[13px] font-semibold">{name}</div>
              <div className="text-[14px] sm:text-[13px] text-muted-foreground leading-relaxed">{text}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-7 sm:grid-cols-2 mb-9">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2.5">
            Сильные стороны
          </p>
          <ul className="space-y-1.5">
            {ANALYSIS.strengths.map((s) => (
              <li key={s} className="flex gap-2 text-[14px] sm:text-[13px]">
                <span className="text-emerald-500 shrink-0">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2.5">
            Что усилить
          </p>
          <ul className="space-y-1.5">
            {ANALYSIS.toImprove.map((s) => (
              <li key={s} className="flex gap-2 text-[14px] sm:text-[13px]">
                <span className="text-amber-500 shrink-0">−</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Section title={`Разбор кейсов (${ANALYSIS.cases.length})`}>
        <div className="space-y-2">
          {ANALYSIS.cases.map((c, i) => {
            const isOpen = openCase === i;
            return (
              <div key={c.title} className="rounded-xl border border-border/60">
                <button
                  type="button"
                  data-click-sound="press"
                  onClick={() => setOpenCase(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors rounded-xl"
                >
                  <span className="text-[15px] sm:text-[13.5px] font-medium">{c.title}</span>
                  <span className={`text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-0.5 space-y-3">
                    <p className="text-[14px] sm:text-[13px] text-muted-foreground">{c.description}</p>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
                        Что хорошо
                      </p>
                      <ul className="space-y-0.5">
                        {c.strengths.map((s) => (
                          <li key={s} className="flex gap-1.5 text-[14px] sm:text-[13px]">
                            <span className="text-emerald-500 shrink-0">+</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                        Что вызывает вопросы
                      </p>
                      <ul className="space-y-0.5">
                        {c.concerns.map((s) => (
                          <li key={s} className="flex gap-1.5 text-[14px] sm:text-[13px]">
                            <span className="text-amber-500 shrink-0">−</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
        <p className="text-[14px] sm:text-[13px] leading-relaxed">
          Портфолио сохранено в базе агентства. Если появится вакансия, под
          которую ты подходишь, — напишем в телеграм.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-9">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Экран 4: ошибка ──────────────────────────────────────────────────

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-[520px]">
      <h1 className="text-[22px] sm:text-[26px] font-bold mb-3">Не получилось разобрать</h1>
      <p className="text-[14px] text-muted-foreground leading-relaxed mb-2">
        Портфолио не открылось за отведённое время. Чаще всего дело в том, что
        сайт закрыт паролем, требует входа или отдаёт содержимое слишком долго.
      </p>
      <p className="text-[14px] text-muted-foreground leading-relaxed mb-7">
        Проверь, что ссылка открывается в режиме инкогнито — и попробуй ещё раз.
      </p>
      <Button onClick={onRetry}>Попробовать другую ссылку</Button>
    </div>
  );
}

// ── Прототип ─────────────────────────────────────────────────────────

export default function PublicPortfolioPrototype() {
  const [screen, setScreen] = useState<Screen>("form");

  const screens: [Screen, string][] = [
    ["form", "Форма"],
    ["waiting", "Ожидание"],
    ["result", "Результат"],
    ["error", "Ошибка"],
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Панель прототипа — в бою её нет */}
      <div className="border-b border-border bg-muted/40 px-5 sm:px-6 py-2.5 flex items-center gap-x-3 gap-y-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Прототип · данные подготовленные
        </span>
        <div className="flex gap-1.5">
          {screens.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                screen === id
                  ? "bg-foreground text-background"
                  : "border border-border hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground sm:ml-auto w-full sm:w-auto">
          В бою — без сайдбара и без пароля
        </span>
      </div>

      <div className="px-5 py-9 sm:px-6 sm:py-14 flex justify-center">
        {screen === "form" && <FormScreen onSubmit={() => setScreen("waiting")} />}
        {screen === "waiting" && <WaitingScreen />}
        {screen === "result" && <ResultScreen />}
        {screen === "error" && <ErrorScreen onRetry={() => setScreen("form")} />}
      </div>
    </div>
  );
}
