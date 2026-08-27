import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

/**
 * Отдаёт экраны интерфейсов из портфолио для карточки кандидата.
 *
 * Файлы лежат в UPLOAD_DIR рядом с резюме и записями звонков, то есть вне
 * public — напрямую браузером не достать, нужен маршрут.
 *
 * Доступ закрыт тем же Basic Auth, что и остальное приложение: middleware
 * висит на всех путях, отдельной проверки здесь не нужно.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const ROOT = join(UPLOAD_DIR, "portfolio-shots");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  // Собираем и проверяем, что итог не вышел за пределы папки: иначе
  // «../../.env» в адресе отдал бы что угодно с диска
  const relative = normalize(path.join("/"));
  if (relative.startsWith("..") || relative.includes("\0")) {
    return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });
  }

  const full = join(ROOT, relative);
  if (!normalize(full).startsWith(normalize(ROOT))) {
    return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });
  }

  try {
    const file = await readFile(full);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/jpeg",
        // Кадры не меняются: имя файла привязано к разбору, а новый разбор
        // переписывает папку целиком
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Экран не найден" }, { status: 404 });
  }
}
