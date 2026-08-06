# Деплой АУФ Match на Railway

Цель: коллеги открывают приложение по ссылке в браузере, логинятся, работают с
общей базой. База (Neon) уже облачная — данные общие автоматически.

Всё, что делается **в браузере под твоим аккаунтом** (регистрация, ввод ключей) —
делаешь ты. Код и конфиг деплоя уже готовы в репозитории.

---

## 1. Залить код на GitHub (приватный репозиторий)

1. Создай **приватный** репозиторий на github.com (без README/gitignore — они уже есть).
2. В терминале проекта:

   ```bash
   git add -A
   git commit -m "chore: подготовка к деплою (Dockerfile, Railway)"
   git branch -M main
   git remote add origin git@github.com:<твой-логин>/auf-match.git
   git push -u origin main
   ```

   > `.env`, `uploads/` и `scripts/data/` (PII кандидатов) в `.gitignore` — в репозиторий не попадут.

## 2. Создать проект на Railway

1. Зарегистрируйся на [railway.app](https://railway.app) (через GitHub — удобнее).
2. **New Project → Deploy from GitHub repo** → выбери `auf-match`.
3. Railway увидит `Dockerfile` и `railway.json` и соберёт образ сам. Первая сборка
   долгая (~5–10 мин: ставится Chromium). Это нормально.

## 3. Переменные окружения

В проекте на Railway: **Variables → добавь**:

| Переменная | Значение |
|---|---|
| `DATABASE_URL` | строка подключения Neon (та же, что в локальном `.env`) |
| `GEMINI_API_KEY` | твой ключ Gemini (весь AI идёт через него) |
| `BASIC_AUTH_USER` | логин для коллег, например `auf` |
| `BASIC_AUTH_PASS` | пароль (сгенерируй: `openssl rand -base64 24`) |
| `INGEST_TOKEN` | токен для внешнего приёма кандидатов (`openssl rand -base64 24`) |
| `NODE_ENV` | `production` |
| `UPLOAD_DIR` | `/app/uploads` |
| `FIGMA_ACCESS_TOKEN` | (опционально, если нужен скрейп Figma) |

> `PORT` задавать **не нужно** — Railway подставит его сам, `next start` подхватит.
>
> ⚠️ В production `BASIC_AUTH_USER` и `BASIC_AUTH_PASS` **обязательны** — без них
> приложение отдаёт 503 (защита от публичного доступа).

## 4. Постоянный диск для загрузок (uploads)

Загруженные резюме пишутся в `UPLOAD_DIR`. Без тома они пропадут при каждом
передеплое. В сервисе на Railway:

1. **Settings → Volumes → New Volume**.
2. Mount path: `/app/uploads`.

## 5. Ссылка для коллег

1. **Settings → Networking → Generate Domain** — получишь адрес вида
   `auf-match-production.up.railway.app`.
2. Дай коллегам: **ссылку + `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`**.

Готово. При каждом `git push` в `main` Railway пересобирает и передеплоивает сам.
Миграции БД применяются автоматически на старте (`prisma migrate deploy`).

## 6. Биллинг Gemini (обязательно для реальной работы)

На бесплатном тарифе лимит ~20 запросов/сутки на модель — анализ 2000+ кандидатов
упрётся в квоту в первый же час (ошибка `quota_daily`).

1. Открой [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Найди свой ключ → включи биллинг на привязанном Google Cloud проекте.
3. Проект перейдёт на pay-as-you-go: лимиты вырастут в тысячи запросов/мин.
   `gemini-2.5-flash` очень дешёвый — полный прогон базы стоит единицы долларов.

## 7. Доступ для внешней интеграции (консультант)

Кандидатов можно заливать из стороннего продукта через API — без доступа к базе
и без общего пароля приложения.

**Эндпоинт:** `POST https://<домен>/api/candidates/ingest`
**Заголовки:** `X-Ingest-Token: <INGEST_TOKEN>`, `Content-Type: application/json`

```json
{
  "source": "Название продукта",
  "candidates": [
    { "name": "Имя Фамилия", "portfolioUrl": "https://behance.net/...", "email": "...", "telegram": "@...", "location": "..." }
  ]
}
```

Обязательны `name` и хотя бы одна ссылка (`portfolioUrl` / `url` / массив `portfolioLinks`).
До 1000 за запрос. Ответ: `{ received, imported, skippedExisting, skippedInvalid }`.
Дедуп по ссылке — повторные заливки не задваивают людей. Кандидаты попадают со
статусом `NEW` и уходят в AI-анализ автоматически.

Отзыв доступа — сменить `INGEST_TOKEN` в переменных Railway.

---

## Обновление приложения

```bash
git add -A && git commit -m "..." && git push
```

Railway подхватит пуш и пересоберёт. Откат — через историю деплоев в панели Railway.

## Если что-то не так

- **Билд падает на Chromium** — проверь, что деплой идёт через `Dockerfile`
  (Settings → Build), а не Nixpacks.
- **503 на всех страницах** — не заданы `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`.
- **Не может подключиться к БД** — проверь `DATABASE_URL` и что Neon-проект активен.
- **Резюме пропадают после передеплоя** — не примонтирован том на `/app/uploads`.
