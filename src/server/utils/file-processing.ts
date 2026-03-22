import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import path from "path";

export type SupportedFileType = "pdf" | "docx";

export class FileProcessingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "FileProcessingError";
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim();
  } catch (error) {
    throw new FileProcessingError("Не удалось извлечь текст из PDF", error);
  }
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    throw new FileProcessingError("Не удалось извлечь текст из DOCX", error);
  }
}

export function getFileType(filename: string): SupportedFileType {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  throw new FileProcessingError(
    `Неподдерживаемый формат файла: ${ext}. Поддерживаются: .pdf, .docx`,
  );
}

export async function extractText(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; fileType: SupportedFileType }> {
  const fileType = getFileType(filename);
  const text =
    fileType === "pdf"
      ? await extractTextFromPdf(buffer)
      : await extractTextFromDocx(buffer);

  if (!text) {
    throw new FileProcessingError("Файл не содержит текста");
  }

  return { text, fileType };
}
