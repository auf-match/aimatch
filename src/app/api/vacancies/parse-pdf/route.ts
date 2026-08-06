import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/server/utils/file-processing";
import { parseVacancy, ClaudeServiceError } from "@/server/services/claude";
import { FileProcessingError } from "@/server/utils/file-processing";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (ext !== ".pdf" && ext !== ".docx") {
      return NextResponse.json(
        { error: "Поддерживаются только .pdf и .docx файлы" },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл слишком большой (макс. 10MB)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text
    let text = "";
    try {
      const extracted = await extractText(buffer, file.name);
      text = extracted.text;
    } catch {
      // PDF might be image-based, will send to Gemini directly
    }

    // Parse via Gemini
    const vacancyData = await parseVacancy(
      text,
      ext === ".pdf" ? buffer : undefined,
    );

    return NextResponse.json(vacancyData);
  } catch (error) {
    if (error instanceof FileProcessingError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof ClaudeServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("Vacancy parse error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
