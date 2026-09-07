/**
 * HTTP Basic Auth для всего приложения.
 *
 * Логика безопасности:
 *   - В production переменные BASIC_AUTH_USER и BASIC_AUTH_PASS ОБЯЗАТЕЛЬНЫ.
 *     Если их нет — 503, чтобы случайно не открыть сайт миру без защиты.
 *   - В dev (NODE_ENV !== "production") middleware пропускает всех, чтобы
 *     не мешать локальной разработке. Можно задать переменные локально, если
 *     хочется протестировать сам флоу логина.
 *
 * В контейнере: передайте обе переменные через окружение (-e или compose).
 * Пароль — длинный, сгенерируйте через `openssl rand -base64 24` или 1Password.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isPublicRoute } from "@/lib/public-routes";
import { isPublicHost, решитьПоПути } from "@/lib/public-host";

export function middleware(req: NextRequest) {
  const путь = req.nextUrl.pathname;

  // Публичный домен (razbor.pragmatica.design) — своя развилка целиком.
  // На нём приложение показывает ровно одну страницу, а внутреннего
  // продукта нет вовсе: не «закрыт паролем», а не существует. Иначе по
  // адресу, который мы раздаём дизайнерам, находился бы вход во
  // внутренний инструмент агентства
  if (isPublicHost(req.headers.get("host"))) {
    const решение = решитьПоПути(путь);
    if (решение.вид === "страница") {
      const url = req.nextUrl.clone();
      url.pathname = "/p/portfolio";
      return NextResponse.rewrite(url);
    }
    if (решение.вид === "пропустить") return NextResponse.next();
    return new NextResponse("Not found", { status: 404 });
  }

  // Публичные адреса — до всех проверок. Список один на всё приложение и
  // лежит в @/lib/public-routes под тестами: разъехавшиеся копии такого
  // списка означали бы либо запароленную публичную страницу, либо
  // открытый наружу продукт
  if (isPublicRoute(путь)) return NextResponse.next();

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd && (!user || !pass)) {
    // Dev без сконфигурированных переменных — пропускаем.
    return NextResponse.next();
  }

  if (isProd && (!user || !pass)) {
    return new NextResponse(
      "Server misconfigured: BASIC_AUTH_USER / BASIC_AUTH_PASS not set",
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (!auth) return unauthorized();

  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorized();

  const decoded = Buffer.from(encoded, "base64").toString();
  const sep = decoded.indexOf(":");
  if (sep < 0) return unauthorized();

  const providedUser = decoded.slice(0, sep);
  const providedPass = decoded.slice(sep + 1);

  if (providedUser === user && providedPass === pass) {
    return NextResponse.next();
  }
  return unauthorized();
}

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="auf-match"' },
  });
}

// Не защищаем статику Next и фавикон — на них всё равно нет смысла.
// /api/candidates/ingest выведен из-под Basic Auth: у него собственная
// токен-авторизация (X-Ingest-Token), чтобы внешняя интеграция не требовала
// общего пароля приложения и легко отзывалась сменой токена.
export const config = {
  // click.mp3 выведен из-под пароля намеренно. Звук нажатия тянет общий
  // лейаут, и на публичной странице этот запрос возвращал 401 — а браузер,
  // получив отказ с требованием авторизации на ЛЮБОМ подзапросе, показывает
  // окно ввода пароля. Страница выглядела запароленной, хотя отдавалась с
  // кодом 200, и по коду ответа страницы это не находилось.
  // Звук на публичных страницах теперь и не запрашивается, но пусть отказ
  // будет невозможен в принципе: в файле со щелчком секретов нет.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|click.mp3|api/candidates/ingest).*)",
  ],
};
