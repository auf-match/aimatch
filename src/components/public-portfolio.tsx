"use client";

/**
 * Публичная страница разбора портфолио.
 *
 * Один компонент на два адреса: /p/portfolio для мира и прототип за
 * паролем (флаг demo). Разбор настоящий — тот же движок, что в b2b,
 * включая оценку визуала.
 *
 * Собрана по правилам, которые задал дизайн-лид:
 *
 * 1. Контрастная типографическая пара и шкала 15 → 32 → 64. Три ступени с
 *    двукратным разрывом: иерархия читается сразу, промежуточные размеры не
 *    нужны. Крупное набрано Lebowski — это шрифт самой «Прагматики», мелкое
 *    Geist'ом: характерный дисплейный против нейтрального гротеска.
 * 2. Чёрный фон, белые карточки, оранжевый акцент без градиента.
 * 3. Шрифт Lebowski.
 *
 * Lebowski лежит одним начертанием (Regular), поэтому весом не играем —
 * иерархию держит только размер. Оранжевый берём тот же, что в продукте,
 * но плоский: градиент из pill--accent здесь не к месту по правилу 2.
 *
 * Страница в первую очередь мобильная: её открывают с телефона по ссылке.
 */
import localFont from "next/font/local";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { PublicResult } from "@/lib/public-result";

const lebowski = localFont({
  src: "../app/fonts/Lebowski-Regular.ttf",
  variable: "--font-lebowski",
  display: "swap",
});

type Screen = "form" | "waiting" | "result" | "failed";

/** Что отдаёт /api/public/portfolio/[id], когда разбор готов */
export interface ГотовыйРазбор {
  имя?: string;
  портфолио?: string | null;
  результат: PublicResult;
}

/** Показывается только в прототипе: настоящему разбору там взяться неоткуда */
const ОБРАЗЕЦ: ГотовыйРазбор = {
  имя: "Дмитрий Евтеев",
  портфолио: "https://behance.net/evteev",
  результат: {
    // Обращение на «ты» — как в настоящем разборе: внутренний текст
    // перекладывается отдельным проходом, см. server/services/public-rendition
    общее:
      "У тебя сильное портфолио с продуктовым уклоном. Экраны собраны цельно, язык держится по всему кейсу — включая служебные состояния, до которых обычно не доходят руки. Слабее там, где нужно объяснить ход мысли: решения ты показал, но не обосновал.",
    критерии: [
      {
        название: "Визуал",
        ступень: "сильный",
        пояснение: "Твои композиция и типографика на уверенном уровне. Язык не разваливается между экранами.",
      },
      {
        название: "UX",
        ступень: "средний",
        пояснение: "Флоу читаются, паттерны ты используешь по назначению. Пустые состояния проработал не везде.",
      },
      {
        название: "Продуктовое мышление",
        ступень: "средний",
        пояснение: "Задачу ты обозначил в двух кейсах из трёх, но связь с решениями показал не до конца.",
      },
      {
        название: "Исследования",
        ступень: "слабый",
        пояснение: "Ты упоминаешь интервью, но не видно, что именно они изменили в интерфейсе.",
      },
    ],
    работает: ["Ты отобрал работы — витрины нет", "Ты показал служебные состояния", "Язык держится по кейсу"],
    нехватает: ["Тебе не хватает «до и после»", "Ты не указал свою роль в проектах", "У тебя нет цифр по результату"],
    кейсы: [
      { название: "Мобильный банк", описание: "Твой самый проработанный кейс: ты показал путь от проблемы до результата." },
      { название: "Маркетплейс", описание: "Сильный визуально, но задачу ты сформулировал общо." },
      { название: "Внутренняя панель", описание: "Уместно сдержанный. Визуал здесь не главное, и это правильно." },
    ],
  },
};

/**
 * Белая карточка на чёрном — единственный контейнер на странице.
 *
 * full — карточка во весь экран. Высоту берём в dvh: это видимая область
 * С УЧЁТОМ свернувшейся адресной строки. Старый vh считал по развёрнутому
 * состоянию, и низ карточки уезжал под панель Safari. Мерить через JS не
 * нужно — значение пришлось бы пересчитывать на поворот, на клавиатуру и
 * на скролл, и до первой отрисовки его нет.
 */
function Card({ children, full }: { children: React.ReactNode; full?: boolean }) {
  return <section className={full ? "card card--full" : "card"}>{children}</section>;
}

/**
 * Колода критериев — по образцу присланной записи.
 *
 * Там верхняя карточка не уезжает вбок лентой, а СБРАСЫВАЕТСЯ: уходит
 * влево с поворотом, а следующая лежала под ней стопкой и поднимается на
 * освободившееся место. Поэтому здесь не прокрутка, а стопка с позицией
 * каждой карточки относительно текущей.
 *
 * Родную прокрутку с прилипанием пришлось убрать: она умеет только
 * возить карточки рядом, а положить их друг на друга — нет. Взамен
 * ведём палец сами, и за это платим: инерция и отскок у краёв теперь
 * наши, а не системные.
 *
 * Во время ведения переходы отключены — иначе карточка тянется за
 * пальцем с задержкой и жест ощущается вязким.
 */
function Deck({ items }: { items: string[][] }) {
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState(0);
  const from = useRef<number | null>(null);
  /**
   * Смещение держим ещё и в ссылке. В onUp значение из состояния —
   * это то, каким оно было на ПРОШЛОЙ отрисовке: между последним
   * pointermove и отпусканием React перерисоваться не успевает, и на
   * быстром жесте там остаётся ноль. Тогда сброс просто не случается.
   */
  const dragRef = useRef(0);

  /** Порог сброса: короткое дрожание пальца не должно листать */
  const THRESHOLD = 60;

  function onDown(e: React.PointerEvent) {
    from.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    if (from.current === null) return;
    const dx = e.clientX - from.current;
    // У краёв колоды тянем вчетверо слабее — упор чувствуется рукой
    const край = (dx < 0 && active === items.length - 1) || (dx > 0 && active === 0);
    dragRef.current = край ? dx / 4 : dx;
    setDrag(dragRef.current);
  }

  function onUp() {
    if (from.current === null) return;
    from.current = null;
    const dx = dragRef.current;
    if (dx < -THRESHOLD && active < items.length - 1) setActive(active + 1);
    else if (dx > THRESHOLD && active > 0) setActive(active - 1);
    dragRef.current = 0;
    setDrag(0);
  }

  const ведём = from.current !== null;

  // Самая длинная карточка — по ней распорка держит высоту колоды
  const самая = items.reduce((a, b) => (b[1].length > a[1].length ? b : a));

  return (
    <div className="deck-wrap">
      <div
        className="deck"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/*
         * Распорка. Карточки уложены абсолютно и своей высоты колоде не
         * дают, поэтому высоту надо задать снаружи. Числом нельзя: на
         * узком экране текст переносится на лишнюю строку, и карточка
         * вылезает на следующий раздел — этим мы уже обжигались.
         * Распорка повторяет самую длинную карточку и растёт вместе с
         * ней, а 150 остаётся нижней границей.
         */}
        <div className="card card--full spacer" aria-hidden="true">
          <h3 className="mid">{самая[0]}</h3>
          <p className="bottom">{самая[1]}</p>
        </div>

        {items.map(([title, text], i) => {
          const rel = i - active;
          let style: React.CSSProperties;

          if (rel < 0) {
            // Сброшенная — улетает влево с поворотом, как в записи.
            // Точка поворота ниже карточки: так она заваливается, а не
            // крутится вокруг себя
            style = {
              transform: "translate(-130%, 64px) rotate(-18deg)",
              transformOrigin: "50% 120%",
              opacity: 0,
              zIndex: 0,
              pointerEvents: "none",
            };
          } else if (rel === 0) {
            style = {
              transform: `translateX(${drag}px) rotate(${drag / 24}deg)`,
              transformOrigin: "50% 120%",
              zIndex: 10,
              transition: ведём ? "none" : undefined,
            };
          } else {
            // Ждущие лежат под верхней и выглядывают СПРАВА — по стороне,
            // куда листаешь. Мельче с каждой ступенью, чтобы уменьшенная
            // карточка вылезала краем, а не сдвигала всю колоду вбок.
            /*
             * Ждущие карточки выглядывают справа из-под верхней.
             *
             * Сдвиг задан в ПРОЦЕНТАХ от ширины карточки, а не в пикселях.
             * Запас до края экрана крошечный — на телефоне 375 от правого
             * края карточки до края экрана остаётся 16 пикселей, — и в
             * пикселях просвет либо не виден на узком экране, либо режется
             * на нём же. В процентах он одинаков на любой ширине.
             *
             * Числа связаны: уменьшение съедает 4% ширины на ступень, и
             * сдвиг должен сперва их возместить, и только сверх этого дать
             * сам просвет. Отсюда 5,75% = 4% возмещения + 1,75% просвета.
             * Меняешь одно — пересчитывай второе, иначе край снова пропадёт.
             *
             * Точка — верхний левый угол: от него карта уходит только
             * вниз-вправо. При точке под карточкой стопка утягивалась вниз
             * на следующий раздел, при точке по верхней середине — поворот
             * задирал левый угол в зазор под заголовком.
             *
             * Глубина ограничена двумя: третья ушла бы за край экрана.
             */
            const глубина = Math.min(rel, 2);
            style = {
              // Поворота здесь нет намеренно. Он роняет правый нижний угол
              // пропорционально ШИРИНЕ карточки, а гасило это уменьшение по
              // ВЫСОТЕ. Пока карточка была 300, запаса хватало; на 150 —
              // уже нет, и стопка свисала на следующий раздел. Стопку
              // держит сдвиг с уменьшением, поворот ей не нужен.
              transform:
                `translateX(${глубина * 5.75}%) ` +
                `scale(${1 - глубина * 0.04})`,
              transformOrigin: "0 0",
              zIndex: 10 - глубина,
              opacity: rel > 2 ? 0 : 1,
              pointerEvents: "none",
            };
          }

          return (
            <section className="card card--full sheet" key={title} style={style}>
              <h3 className="mid">{title}</h3>
              <p className="bottom">{text}</p>
            </section>
          );
        })}
      </div>

      <div className="dots">
        {items.map(([title], i) => (
          <button
            key={title}
            className={i === active ? "dot on" : "dot"}
            onClick={() => setActive(i)}
            aria-label={title}
          />
        ))}
      </div>
    </div>
  );
}

// ── Экран: форма ─────────────────────────────────────────────────────

function FormScreen({ onSubmit }: { onSubmit: (id: string) => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [link, setLink] = useState("");
  const [согласие, setСогласие] = useState(false);
  const [шлём, setШлём] = useState(false);
  const [ошибка, setОшибка] = useState<string | null>(null);
  // Поле-приманка: людям не видно, боты заполняют
  const [website, setWebsite] = useState("");
  const ready =
    Boolean(name.trim() && contact.trim() && link.trim()) && согласие && !шлём;

  async function отправить() {
    setШлём(true);
    setОшибка(null);
    try {
      const res = await fetch("/api/public/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contact,
          portfolio: link,
          consent: согласие,
          website,
        }),
      });
      const данные = await res.json().catch(() => ({}));
      if (!res.ok) {
        setОшибка(данные.error || "Не удалось отправить. Попробуй ещё раз");
        return;
      }
      onSubmit(данные.id);
    } catch {
      // Сеть отвалилась — человеку важно знать, что дело не в нём
      setОшибка("Нет связи. Проверь интернет и попробуй ещё раз");
    } finally {
      setШлём(false);
    }
  }

  const fields: [string, string, string, (v: string) => void, string][] = [
    ["Имя", name, "Как тебя зовут", setName, "text"],
    ["Телеграм или почта", contact, "@nickname", setContact, "text"],
    // Плейсхолдер отвечает на вопрос «а мою площадку примут?», а не
    // показывает формат ссылки: формат и так очевиден из названия поля
    ["Ссылка на портфолио", link, "Любой ресурс", setLink, "url"],
  ];

  return (
    <>
      <header className="hero">
        <h1 className="display">Прожарочная</h1>
        <p className="lede">
          Прожарочная разбирает портфолио с той же логикой, что дизайн-лид
          агентства, и показывает то, что тебе никто не озвучит. Здесь это
          можно прочитать.
        </p>
      </header>

      <Card>
        {fields.map(([label, value, placeholder, set, type], i) => (
          <div className="field" key={label}>
            <label htmlFor={`f${i}`}>{label}</label>
            <input
              id={`f${i}`}
              type={type}
              inputMode={type === "url" ? "url" : undefined}
              autoCapitalize={type === "url" ? "none" : "sentences"}
              autoCorrect="off"
              spellCheck={false}
              value={value}
              placeholder={placeholder}
              onChange={(e) => set(e.target.value)}
            />
          </div>
        ))}

        {/* Приманка для ботов: не видна и не читается голосовым доступом */}
        <input
          className="honeypot"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />

        {/* Согласие — обычная галочка, а не текст «нажимая, вы соглашаетесь»:
            согласие должно быть действием, а не побочным следствием отправки */}
        <label className="consent">
          <input
            type="checkbox"
            checked={согласие}
            onChange={(e) => setСогласие(e.target.checked)}
          />
          {/* Тот же текст лежит в CONSENT_TEXT и сохраняется вместе с
              заявкой. Меняешь здесь — меняй и там: доказывать придётся ту
              формулировку, под которой человек поставил галочку */}
          <span>
            Согласен на обработку персональных данных. Портфолио и контакт
            попадут в базу кандидатов Pragmatica.
          </span>
        </label>

        <button className="action" disabled={!ready} onClick={отправить}>
          {шлём ? "Отправляем…" : "Разобрать портфолио"}
        </button>

        {ошибка && <p className="ошибка">{ошибка}</p>}
      </Card>

      {/* Куда попадут данные, теперь сказано в самой галочке — здесь
          осталось только то, чего там нет */}
      <p className="fineprint">Напишем, если под тебя появится вакансия.</p>
    </>
  );
}

// ── Экран: ожидание ──────────────────────────────────────────────────

/**
 * @param id — заявка, за которой следим. В прототипе его нет: там экран
 * показывается сам по себе, и опрашивать нечего.
 */
function WaitingScreen({
  id,
  onReady,
  onFailed,
}: {
  id?: string;
  onReady?: (д: ГотовыйРазбор) => void;
  onFailed?: () => void;
}) {
  const [этап, setЭтап] = useState(1);

  useEffect(() => {
    if (!id) return;
    let живо = true;

    const спросить = async () => {
      try {
        const res = await fetch(`/api/public/portfolio/${id}`);
        if (!res.ok || !живо) return;
        const д = await res.json();
        if (!живо) return;
        if (д.состояние === "готово") {
          clearInterval(таймер);
          onReady?.(д);
        } else if (д.состояние === "не получилось") {
          clearInterval(таймер);
          onFailed?.();
        }
      } catch {
        // Связь могла моргнуть — молчим и пробуем на следующем круге
      }
    };

    // Раз в 5 секунд: разбор идёт минуты, чаще — впустую греть сервер
    const таймер = setInterval(спросить, 5000);
    // Но первый раз — сразу: по сохранённой ссылке разбор уже может быть
    // готов, и заставлять человека смотреть на «Смотрим» пять секунд глупо
    void спросить();

    // Шаги двигаем по времени: настоящих отметок прогресса у разбора нет,
    // и выдумывать их точность не стоит — это индикатор, что не зависло
    const шаги = setTimeout(() => живо && setЭтап(2), 20000);

    return () => {
      живо = false;
      clearInterval(таймер);
      clearTimeout(шаги);
    };
  }, [id, onReady, onFailed]);

  return (
    <>
      <header className="hero">
        <h1 className="display">Смотрим</h1>
        <p className="lede">
          Не закрывай страницу, обычно пара минут. Разбор появится прямо здесь.
        </p>
      </header>

      {/*
       * Орб — единственное, что показывает: работа идёт. Список шагов
       * отсюда убран, он всё равно двигался по таймеру, а не по настоящим
       * отметкам разбора, и обещал точность, которой нет.
       */}
      <div className="orb" aria-hidden="true">
        <ThinkingOrb state="solving" size={64} theme="dark" />
      </div>

      {id && <СсылкаНаРазбор id={id} />}
    </>
  );
}

/**
 * Запасной выход, если страницу всё-таки закроют.
 *
 * Отправки в телеграм у нас нет, и закрытая вкладка означала бы, что
 * разбор собран, но человек его не увидит. Ссылка на свой разбор снимает
 * эту зависимость от вкладки, ничего не обещая от нашего имени.
 */
function СсылкаНаРазбор({ id }: { id: string }) {
  const [скопировано, setСкопировано] = useState(false);
  const [ручками, setРучками] = useState(false);

  const адрес =
    typeof window !== "undefined" ? `${window.location.origin}/p/portfolio/${id}` : "";

  async function копировать() {
    try {
      await navigator.clipboard.writeText(адрес);
      setСкопировано(true);
      setTimeout(() => setСкопировано(false), 3000);
    } catch {
      // Без https и в части браузеров буфер недоступен — показываем
      // адрес, чтобы человек скопировал руками, а не упёрся в молчание
      setРучками(true);
    }
  }

  return (
    <section className="link-block">
      <p className="t-подпись">
        Если всё же закроешь — по этой ссылке вернёшься к разбору. Она никуда
        не отправляется, сохрани себе.
      </p>

      <button className="copy" onClick={копировать}>
        {скопировано ? "Скопировано" : "Скопировать ссылку"}
      </button>

      {ручками && <p className="адрес">{адрес}</p>}
    </section>
  );
}

// ── Экран: результат ─────────────────────────────────────────────────

function ResultScreen({ данные }: { данные: ГотовыйРазбор }) {
  const р = данные.результат;

  // Ступень идёт вместе с названием: «Визуал — средний». Отдельной строкой
  // она превращалась бы в ярлык, а так читается как часть фразы
  const критерии: string[][] = р.критерии.map((k) => [
    `${k.название} — ${k.ступень}`,
    k.пояснение,
  ]);

  return (
    <>
      <header className="hero">
        <h1 className="display">Разбор</h1>
        {данные.имя && <p className="subject">{данные.имя}</p>}
        {данные.портфолио && <p className="lede">{краткийАдрес(данные.портфолио)}</p>}
      </header>

      {р.общее && (
        <Card>
          <p className="pull">{р.общее}</p>
        </Card>
      )}

      {критерии.length > 0 && (
        <>
          {/* Заголовок группы стоит на фоне, а не внутри карточки: каждый
              критерий — своя карточка, и накрывать их общей было бы
              вложением карточки в карточку */}
          <h2 className="group">По критериям</h2>
          <Deck items={критерии} />
        </>
      )}

      {р.работает.length > 0 && (
        <Card>
          <h2 className="mid">Что работает</h2>
          <ul className="marks">
            {р.работает.map((s) => (
              <li key={s}>
                <span className="mark" />
                {s}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {р.нехватает.length > 0 && (
        <Card>
          <h2 className="mid">Чего не хватает</h2>
          <ul className="marks muted">
            {р.нехватает.map((s) => (
              <li key={s}>
                <span className="mark hollow" />
                {s}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {р.кейсы.length > 0 && (
        <Card>
          <h2 className="mid">По кейсам</h2>
          <dl className="rows">
            {р.кейсы.map((c) => (
              <div key={c.название}>
                <dt>{c.название}</dt>
                <dd>{c.описание}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <p className="fineprint">
        Разбор сделан автоматически по тому, что видно в портфолио. Это взгляд
        на подачу работ, а не оценка тебя как специалиста.
      </p>
    </>
  );
}

/** «https://behance.net/evteev/» → «behance.net/evteev» */
function краткийАдрес(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// ── Экран: не получилось ─────────────────────────────────────────────

function FailedScreen() {
  return (
    <>
      <header className="hero">
        <h1 className="display">Не вышло</h1>
        <p className="lede">
          Не удалось открыть портфолио — бывает, если страница закрыта паролем
          или ссылка ведёт не туда. Напишем в телеграм, если разберёмся.
        </p>
      </header>
    </>
  );
}

// ── Страница ─────────────────────────────────────────────────────────

/**
 * @param demo — режим прототипа: снизу появляется переключатель экранов, а
 * экран результата показывает придуманный разбор. На публичном адресе его
 * нет: там человек проходит форму → ожидание, а готовый разбор придёт
 * ссылкой в телеграм, когда система его соберёт.
 *
 * Один компонент на оба адреса намеренно. Копия для публичной страницы
 * означала бы, что правки в прототипе до неё не доезжают, — а мы уже
 * ловили это с опубликованной страницей, которая осталась со старым кодом.
 */
/**
 * @param id — открыть сразу разбор этой заявки, минуя форму. Так работает
 * ссылка, которую человек копирует на экране ожидания: разбор ещё идёт —
 * досчитается здесь, готов — покажется сразу.
 */
export default function PublicPortfolio({
  demo = false,
  id: изСсылки,
}: {
  demo?: boolean;
  id?: string;
}) {
  const [screen, setScreen] = useState<Screen>(изСсылки ? "waiting" : "form");
  const [id, setId] = useState<string | null>(изСсылки ?? null);
  const [разбор, setРазбор] = useState<ГотовыйРазбор | null>(null);

  const принять = useCallback((д: ГотовыйРазбор) => {
    setРазбор(д);
    setScreen("result");
  }, []);
  const неВышло = useCallback(() => setScreen("failed"), []);

  // В прототипе показываем придуманный разбор: настоящего там взяться
  // неоткуда, а посмотреть на вёрстку экрана нужно
  const кПоказу = разбор ?? (demo ? ОБРАЗЕЦ : null);

  return (
    <div className={`shell ${lebowski.variable}`}>
      <main>
        {screen === "form" && (
          <FormScreen
            onSubmit={(новый) => {
              setId(новый);
              setScreen("waiting");
            }}
          />
        )}
        {screen === "waiting" && (
          <WaitingScreen id={id ?? undefined} onReady={принять} onFailed={неВышло} />
        )}
        {screen === "result" && кПоказу && <ResultScreen данные={кПоказу} />}
        {screen === "failed" && <FailedScreen />}
      </main>

      {demo && (
        <nav className="states">
          {(["form", "waiting", "result"] as Screen[]).map((s) => (
            <button
              key={s}
              onClick={() => setScreen(s)}
              className={screen === s ? "on" : ""}
            >
              {s === "form" ? "форма" : s === "waiting" ? "ожидание" : "результат"}
            </button>
          ))}
        </nav>
      )}

      <style jsx global>{`
        /* ── Правила ───────────────────────────────────────────────
           Шкала ровно из трёх ступеней: 15 / 32 / 64. Промежуточных
           размеров нет — разрыв вдвое и есть иерархия.
           Чёрный фон, белые карточки, плоский оранжевый. */
        .shell {
          --bg: #000;
          --card: #fff;
          --ink: #151515;
          --ink-2: #6b6b6b;
          --accent: #f97029;
          --hair: #ece7e3;

          min-height: 100dvh;
          background: var(--bg);
          -webkit-font-smoothing: antialiased;
          /* Карточки колоды выходят вбок за свой контейнер — без этого
             страница получала бы горизонтальную прокрутку */
          overflow-x: hidden;
        }
        /* ── Отступы ──────────────────────────────────────────────
           Базовый зазор 12 — между карточками ВНУТРИ одного раздела.
           Всё, что крупнее, набирается поверх него полями отдельных
           элементов: 12 везде подряд не даёт странице сгруппироваться,
           и она читается сплошной лентой.

           Получается три величины: 12 между соседями, 16 от заголовка
           раздела до его содержимого, 40 перед новым разделом. Отступ
           внутри раздела всегда меньше отступа снаружи — по этой
           разнице и видно, где раздел кончился. */
        .shell main {
          max-width: 560px;
          margin: 0 auto;
          padding: 40px 16px 120px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Крупная ступень — только Lebowski, только 64 */
        .display {
          font-family: var(--font-lebowski), Georgia, serif;
          font-size: 64px;
          line-height: 0.94;
          font-weight: 400;
          letter-spacing: -0.02em;
          color: #fff;
          margin: 0;
        }
        /* Средняя ступень — 32, тем же шрифтом: связывает заголовки между собой */
        .mid {
          font-family: var(--font-lebowski), Georgia, serif;
          font-size: 32px;
          line-height: 1.05;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: var(--ink);
          margin: 0 0 20px;
        }
        /* Мелкая ступень — 17, нейтральный гротеск: весь читаемый текст.
           Интерлиньяж поднят следом за кеглем, иначе строки слипаются:
           отношение к кеглю осталось прежним. */
        .shell,
        .shell input,
        .shell button {
          font-size: 17px;
          line-height: 24px;
        }

        /* Заголовок группы карточек — та же средняя ступень, но на фоне.
           Сверху 40 (12 зазора + 28) — отрыв от прошлого раздела; снизу
           16 (12 + 4) — привязка к своему. Раньше было 32 и 12, и по
           такой разнице заголовок читался как ещё одна карточка. */
        .group {
          font-family: var(--font-lebowski), Georgia, serif;
          font-size: 32px;
          line-height: 1.05;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: #fff;
          margin: 28px 0 4px;
        }

        /* Шапка экрана — самый крупный отрыв: 12 + 28 = 40 */
        .hero { margin-bottom: 28px; }
        /* Орб по центру и втрое крупнее.
           Размер задан преобразованием, а не свойствами: у библиотеки
           ровно два размера, 64 и 20, и это разные рисунки — число точек
           и их размер подобраны под каждый, а не пересчитываются.
           Поэтому берём готовые 64 и увеличиваем; место под него держим
           высотой обёртки, иначе увеличенный орб наехал бы на соседей. */
        .orb {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 120px;
          margin: 8px 0 20px;
          line-height: 0;
        }
        /* 120 из родных 64 — растягиванием готового холста. Отрисовать
           сразу нужного размера нельзя: у библиотеки ровно два размера,
           64 и 20, а на произвольном она молча ломается — набора под
           него у неё нет. Плата за растягивание — мягкие края точек,
           но на 1,875 она заметно меньше, чем была на тройном. */
        .orb > * {
          transform: scale(1.875);
          transform-origin: center;
        }
        /* Имя кандидата — вторая ступень под 64-м заголовком */
        .subject {
          font-family: var(--font-lebowski), Georgia, serif;
          font-size: 32px;
          line-height: 1.05;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: #fff;
          margin: 8px 0 0;
        }
        .lede {
          margin: 16px 0 0;
          color: #8a8a8a;
          max-width: 34em;
        }
        .subject + .lede { margin-top: 8px; }

        .card p { margin: 0; }

        /* Высокая карточка критерия. 300 — не жёсткая высота, а нижняя
           граница: длинный текст карточку растянет, а не вылезет за неё.
           Заголовок прижат кверху, текст к низу — воздух собирается
           посередине и не зависит от длины текста. */
        .card--full {
          display: flex;
          flex-direction: column;
        }
        .card--full .mid { margin-bottom: 0; }
        /* Текст прижат к низу; 24 — минимальный просвет до заголовка,
           когда карточка стала низкой и воздуха между ними почти нет */
        .card--full .bottom { margin-top: auto; padding-top: 24px; }

        /* ── Колода ───────────────────────────────────────────────
           Карточки стоят абсолютно, друг на друге, и своей высоты
           контейнеру не дают — её задаёт распорка ниже. */
        .deck {
          position: relative;
          touch-action: pan-y; /* вертикальную прокрутку страницы не перехватываем */
        }
        /* Распорка держит высоту колоды по самой длинной карточке.
           Место занимает, но не видна — потому visibility, а не display.
           150 — нижняя граница; на узком экране лишняя строка текста
           растянет и распорку, и колоду вместе с ней. */
        .spacer {
          visibility: hidden;
          display: flex;
          flex-direction: column;
          min-height: 150px;
        }
        .sheet {
          position: absolute;
          inset: 0;
          transform-origin: 50% 120%; /* поворот от точки ниже карточки — как у брошенной карты */
          transition: transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.32s ease;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
          will-change: transform;
          user-select: none;
        }

        /* Колода с точками — один раздел, поэтому снизу отрыв как у
           раздела: 12 зазора + 16 = 28 до следующей карточки */
        .deck-wrap { margin-bottom: 16px; }
        .dots {
          display: flex;
          justify-content: center;
          gap: 8px;
          padding: 20px 0 0;
        }
        .dot {
          width: 7px;
          height: 7px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: #3a3a3a;
          cursor: pointer;
          transition: background 0.2s, width 0.2s;
        }
        /* Активная — не просто цветом: вытянутая точка видна и без цвета */
        .dot.on { width: 20px; border-radius: 999px; background: var(--accent); }

        .card {
          background: var(--card);
          color: var(--ink);
          border-radius: 20px;
          padding: 24px 20px;
        }

        /* Форма */
        .field + .field { margin-top: 16px; }
        .field label {
          display: block;
          color: var(--ink-2);
          margin-bottom: 6px;
        }
        .field input {
          width: 100%;
          height: 48px;
          padding: 0 14px;
          border: 1px solid var(--hair);
          border-radius: 12px;
          background: #fff;
          color: var(--ink);
          outline: none;
        }
        .field input:focus { border-color: var(--accent); }
        .field input::placeholder { color: #b5b0ac; }

        .action {
          width: 100%;
          height: 52px;
          margin-top: 24px;
          border: 0;
          border-radius: 12px;
          background: var(--accent); /* плоский, без градиента */
          color: #fff;
          cursor: pointer;
        }
        /* Приманка: убрана из потока и с глаз, но остаётся заполняемой —
           display:none боты пропускают, а это поле они находят */
        .honeypot {
          position: absolute;
          left: -9999px;
          width: 1px;
          height: 1px;
          opacity: 0;
        }
        .ошибка { margin-top: 12px; color: #d2321a; }

        /* Согласие. Галочка крупная — 24: по гайдлайнам мелкие цели
           пальцем не берутся, а промах здесь означает, что человек не
           поймёт, почему кнопка не работает */
        .consent {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-top: 24px;
          cursor: pointer;
          color: var(--ink-2);
        }
        .consent input {
          width: 24px;
          height: 24px;
          margin: 0;
          flex-shrink: 0;
          accent-color: var(--accent);
          cursor: pointer;
        }

        /* Запасная ссылка на разбор: действие второстепенное, поэтому
           контурная кнопка, а не залитая оранжевым — она не должна
           перетягивать внимание с самого ожидания */
        .t-подпись { color: var(--ink-2); }
        .copy {
          width: 100%;
          height: 48px;
          margin-top: 16px;
          border: 1px solid var(--hair);
          border-radius: 12px;
          background: #fff;
          color: var(--ink);
          font: inherit;
          cursor: pointer;
        }
        .copy:active { background: #f7f5f3; }
        .адрес {
          margin-top: 12px;
          color: var(--ink-2);
          word-break: break-all;
          user-select: all; /* тап выделяет адрес целиком */
        }

        /* ── Запасная ссылка ──────────────────────────────────────
           Карточки здесь больше нет: ни заливки, ни рамки — текст лежит
           прямо на фоне страницы. Поэтому и поля свои, по краю страницы,
           а не по краю карточки: 4 — как у сноски внизу. */
        .link-block {
          padding: 0 4px;
          color: #8a8a8a;
        }
        /* Кнопка осталась единственным телом в блоке, поэтому она и
           берёт на себя вес: белая заливка, чёрный текст */
        .link-block .copy {
          background: #fff;
          border-color: transparent;
          color: var(--ink);
        }
        .link-block .copy:active { background: #e8e5e2; }
        .link-block .адрес { color: #8a8a8a; }

        .action:disabled { background: #efece9; color: #b5b0ac; cursor: not-allowed; }
        .action:active:not(:disabled) { background: #e35f1a; }

        /* Сноска — не часть последнего раздела, поэтому 12 + 12 = 24 */
        .fineprint {
          margin: 12px 4px 0;
          color: #6f6f6f;
        }

        /* Ожидание: номер шага — средняя ступень */
        .step {
          display: flex;
          align-items: baseline;
          gap: 16px;
          padding: 14px 0;
        }
        .step + .step { border-top: 1px solid var(--hair); }
        .step-n {
          font-family: var(--font-lebowski), Georgia, serif;
          font-size: 32px;
          line-height: 1;
          color: var(--hair);
          width: 32px;
          flex-shrink: 0;
        }
        .step.now .step-n { color: var(--accent); }
        .step.done .step-n { color: var(--ink); }
        .step-t { flex: 1; }
        .step.wait .step-t { color: var(--ink-2); }
        .step-s { color: var(--accent); }

        /* Результат */
        .pull { margin: 0; }
        .rows > div { padding: 14px 0; }
        .rows > div:first-child { padding-top: 0; }
        .rows > div + div { border-top: 1px solid var(--hair); }
        .rows dt { color: var(--ink); margin-bottom: 2px; }
        .rows dd { margin: 0; color: var(--ink-2); }

        .marks { list-style: none; margin: 0; padding: 0; }
        .marks li {
          display: flex;
          align-items: baseline;
          gap: 12px;
          padding: 7px 0;
        }
        .mark {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }
        .mark.hollow { background: none; box-shadow: inset 0 0 0 1.5px #c9c4c0; }
        .marks.muted li { color: var(--ink-2); }

        /* Переключатель прототипа — в готовой странице его не будет */
        .states {
          position: fixed;
          left: 50%;
          bottom: 20px;
          transform: translateX(-50%);
          display: flex;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: #1a1a1a;
        }
        .states button {
          border: 0;
          background: none;
          padding: 8px 16px;
          border-radius: 999px;
          color: #8a8a8a;
          cursor: pointer;
        }
        .states button.on { background: var(--accent); color: #fff; }
      `}</style>
    </div>
  );
}
