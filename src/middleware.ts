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
 * Внутри Railway/Render: задайте обе переменные в Settings → Variables.
 * Пароль — длинный, сгенерируйте через `openssl rand -base64 24` или 1Password.
 */
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/candidates/ingest).*)"],
};
