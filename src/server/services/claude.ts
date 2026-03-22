import Anthropic from "@anthropic-ai/sdk";
import { buildResumeParsePrompt } from "../prompts/resume-parse";
import { CandidateData } from "../types";

const anthropic = new Anthropic();

export class ClaudeServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClaudeServiceError";
  }
}

export async function parseResume(
  fileContent: string | Buffer,
  fileType: "pdf" | "docx",
): Promise<CandidateData> {
  const text =
    typeof fileContent === "string" ? fileContent : fileContent.toString("utf-8");

  if (!text.trim()) {
    throw new ClaudeServiceError("Пустое содержимое резюме");
  }

  const prompt = buildResumeParsePrompt(text);

  let rawResponse: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      throw new ClaudeServiceError("Claude вернул не текстовый ответ");
    }
    rawResponse = block.text;
  } catch (error) {
    if (error instanceof ClaudeServiceError) throw error;
    throw new ClaudeServiceError("Ошибка вызова Claude API", error);
  }

  let parsed: CandidateData;
  try {
    parsed = JSON.parse(rawResponse) as CandidateData;
  } catch {
    throw new ClaudeServiceError(
      `Claude вернул невалидный JSON: ${rawResponse.slice(0, 200)}...`,
    );
  }

  if (!parsed.name || !parsed.role || !parsed.grade) {
    throw new ClaudeServiceError(
      "Claude не извлёк обязательные поля (name, role, grade)",
    );
  }

  return parsed;
}
