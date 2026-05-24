// src/components/candidate-upload-types.ts

export interface Experience {
  id: string;
  company: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  keyAchievements: string[];
  isBigtech: boolean;
  isStudio: boolean;
}

export interface CandidateResult {
  id: string;
  name: string;
  role: string;
  grade: string;
  yearsOfExperience: number | null;
  specializations: string[];
  domains: string[];
  segment: string | null;
  platforms: string[];
  skills: string[];
  tools: string[];
  location: string | null;
  email: string | null;
  telegramContact: string | null;
  linkedinUrl: string | null;
  aiSummary: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  aiConfidenceScore: number | null;
  portfolioLinks: string[];
  portfolioAnalysis?: unknown | null; // null = анализ портфолио не запускался
  experiences: Experience[];
}

export interface DuplicateInfo {
  reason: "email" | "LinkedIn";
  existing: {
    id: string;
    name: string;
    role: string;
    grade: string;
    email: string | null;
    linkedinUrl: string | null;
    createdAt: string;
  };
  parsedName: string;
}

export interface NeedsDirectionInfo {
  suggestedDirection: "product" | "communication";
  confidence: number;
  reasoning: string;
  parsedName: string;
}
