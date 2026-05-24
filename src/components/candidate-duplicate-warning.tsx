// src/components/candidate-duplicate-warning.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import type { DuplicateInfo } from "@/components/candidate-upload-types";

interface Props {
  duplicate: DuplicateInfo;
  onForceCreate: () => void;
  onReset: () => void;
  resetLabel?: string; // default "Отмена"
}

export function DuplicateWarning({ duplicate, onForceCreate, onReset, resetLabel = "Отмена" }: Props) {
  const { existing, reason, parsedName } = duplicate;
  const createdDate = new Date(existing.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-5 py-4">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Похоже, этот кандидат уже есть в базе
        </p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          Совпадение по {reason === "email" ? "email-адресу" : "LinkedIn"}: резюме{" "}
          <span className="font-medium">{parsedName}</span> совпадает с карточкой{" "}
          <span className="font-medium">{existing.name}</span>, добавленной {createdDate}.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{existing.name}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {existing.role} · {existing.grade}
              </p>
              {existing.email && (
                <p className="text-xs text-muted-foreground mt-1">{existing.email}</p>
              )}
              {existing.linkedinUrl && (
                <p className="text-xs text-muted-foreground">{existing.linkedinUrl}</p>
              )}
            </div>
            <Link href={`/candidates/${existing.id}`} target="_blank">
              <Button variant="outline" size="sm">Открыть карточку</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onReset} className="flex-1">
          {resetLabel}
        </Button>
        <Button
          variant="outline"
          onClick={onForceCreate}
          className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/5"
        >
          Создать всё равно
        </Button>
      </div>
    </div>
  );
}
