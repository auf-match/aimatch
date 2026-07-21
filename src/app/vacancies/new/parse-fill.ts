// Общие типы формы вакансии + чистая логика раскладки AI-распарсенных полей.
// Зовут клиентские хендлеры на /vacancies/new: аудио-путь (handleAudioUpload)
// и текстовый (handleTextParse). Сами роуты parse-audio/parse-text только
// возвращают fields — раскладку делает клиент.

export interface ScoringCriterion {
  criterion: string;
  weight: number;
  type: "required" | "nice_to_have" | "stop_factor";
}

export interface VacancyFormData {
  // Step 1
  title: string;
  clientName: string;
  clientLead: string;
  productDescription: string;
  reasonForHiring: string;
  // Step 2
  role: string;
  grade: string;
  designersNeeded: number;
  employmentType: string;
  workFormat: string;
  location: string;
  timezone: string;
  salaryRange: string;
  desiredStartDate: string;
  duration: string;
  // Step 3
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  needsInternational: boolean;
  specialCompetencies: string[];
  redFlags: string[];
  // Step 4
  portfolioReferences: string[];
  teamComposition: string;
  decisionMaker: string;
  hiringStages: number | null;
  testTask: string;
  // Step 5
  scoringCriteria: ScoringCriterion[];
  clientNotes: string;
  internalNotes: string;
}

// "low" — AI неуверен; "missing" — AI не нашёл значение.
export type FieldStatus = "low" | "missing";

export interface ParsedField {
  value: unknown;
  confidence: "high" | "low" | null;
}
export type ParsedFields = Record<string, ParsedField | undefined>;

export interface FieldsUpdate {
  data: Partial<VacancyFormData>;
  hints: Map<string, FieldStatus>;
}

/**
 * Раскладывает fields из AI-парсера в частичный апдейт формы + карту подсветок.
 * Пустое значение (null/undefined/пустая строка/пустой массив) → дефолт поля,
 * статус "missing". Непустое значение с confidence "low" → статус "low".
 */
export function buildFieldsUpdate(fields: ParsedFields): FieldsUpdate {
  const hints = new Map<string, FieldStatus>();
  const data: Partial<VacancyFormData> = {};

  const isEmptyValue = (v: unknown) =>
    v === null ||
    v === undefined ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "string" && v.trim() === "");

  const apply = <K extends keyof VacancyFormData>(
    key: K,
    rawValue: unknown,
    defaultValue: VacancyFormData[K],
  ) => {
    const v = isEmptyValue(rawValue) ? defaultValue : rawValue;
    (data[key] as VacancyFormData[K]) = v as VacancyFormData[K];
  };

  for (const [key, info] of Object.entries(fields)) {
    const v = info?.value;
    const conf = info?.confidence;
    if (isEmptyValue(v)) hints.set(key, "missing");
    else if (conf === "low") hints.set(key, "low");
  }

  apply("title", fields.title?.value, "");
  apply("clientName", fields.clientName?.value, "");
  apply("clientLead", fields.clientLead?.value, "");
  apply("productDescription", fields.productDescription?.value, "");
  apply("reasonForHiring", fields.reasonForHiring?.value, "");
  apply("role", fields.role?.value, "PRODUCT_DESIGNER");
  apply("grade", fields.grade?.value, "MIDDLE");
  apply("designersNeeded", fields.designersNeeded?.value, 1);
  apply("employmentType", fields.employmentType?.value, "FULL_TIME");
  apply("workFormat", fields.workFormat?.value, "REMOTE");
  apply("location", fields.location?.value, "");
  apply("timezone", fields.timezone?.value, "");
  apply("salaryRange", fields.salaryRange?.value, "");
  apply("desiredStartDate", fields.desiredStartDate?.value, "");
  apply("duration", fields.duration?.value, "");
  apply("keyTasks", fields.keyTasks?.value, []);
  apply("requiredSkills", fields.requiredSkills?.value, []);
  apply("niceToHaveSkills", fields.niceToHaveSkills?.value, []);
  apply("preferredDomains", fields.preferredDomains?.value, []);
  apply("requiredTools", fields.requiredTools?.value, []);
  apply("needsInternational", fields.needsInternational?.value, false);
  apply("specialCompetencies", fields.specialCompetencies?.value, []);
  apply("redFlags", fields.redFlags?.value, []);
  apply("portfolioReferences", fields.portfolioReferences?.value, []);
  apply("teamComposition", fields.teamComposition?.value, "");
  apply("decisionMaker", fields.decisionMaker?.value, "");
  apply("hiringStages", fields.hiringStages?.value, null);
  apply("testTask", fields.testTask?.value, "");
  apply("scoringCriteria", fields.scoringCriteria?.value, []);
  apply("clientNotes", fields.clientNotes?.value, "");
  apply("internalNotes", fields.internalNotes?.value, "");

  return { data, hints };
}
