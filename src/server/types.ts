export type CandidateRole =
  | "PRODUCT_DESIGNER"
  | "UX_DESIGNER"
  | "UI_DESIGNER"
  | "COMMUNICATION_DESIGNER"
  | "UX_RESEARCHER"
  | "DESIGN_LEAD"
  | "ART_DIRECTOR"
  | "BRAND_DESIGNER"
  | "MOTION_DESIGNER"
  | "OTHER";

export type Grade =
  | "JUNIOR"
  | "MIDDLE"
  | "MIDDLE_PLUS"
  | "SENIOR"
  | "SENIOR_PLUS"
  | "LEAD"
  | "HEAD";

export type Segment = "B2B" | "B2C" | "BOTH";

export interface ExperienceData {
  company: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  keyAchievements: string[];
  isBigtech: boolean;
  isStudio: boolean;
}

export interface CandidateData {
  name: string;
  role: CandidateRole;
  grade: Grade;
  yearsOfExperience: number | null;
  specializations: string[];
  domains: string[];
  segment: Segment | null;
  platforms: string[];
  skills: string[];
  tools: string[];
  location: string | null;
  timezone: string | null;
  languages: { lang: string; level: string }[] | null;
  salaryExpectations: string | null;
  education: string | null;

  hasBigtechExperience: boolean;
  hasStudioExperience: boolean;
  hasInternationalExperience: boolean;

  aiSummary: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  aiConfidenceScore: number;

  telegramContact: string | null;
  email: string | null;
  linkedinUrl: string | null;

  portfolioLinks: string[];

  experiences: ExperienceData[];
}
