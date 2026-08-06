"use client";

import { useState } from "react";
import { Users, Briefcase, Sparkles, Target, Search } from "lucide-react";
import { PrototypeShell } from "../_shell";
import { Menu, MenuItem, HoveredLink, ProductItem } from "../_navbar-menu";

export default function NavbarMenuPrototype() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <PrototypeShell wide>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Меню при наведении</h1>
        <p className="text-sm text-muted-foreground">
          Наведи курсор на пункт — панель раскрывается и «перетекает» между разделами (motion). Оранжевый акцент сохранён.
        </p>
      </div>

      {/* Hover-навбар по центру, как в демо Aceternity/21st */}
      <div className="flex justify-center py-10">
        <Menu setActive={setActive}>
          {/* Кандидаты */}
          <MenuItem setActive={setActive} active={active} item="Кандидаты">
            <div className="flex flex-col gap-3">
              <HoveredLink href="/prototype/candidates">Все кандидаты</HoveredLink>
              <HoveredLink href="/candidates/upload">Загрузить кандидата</HoveredLink>
              <HoveredLink href="/candidates/upload">Импорт (Behance / Huntflow)</HoveredLink>
              <HoveredLink href="/candidates/analyze-status">Мониторинг анализа</HoveredLink>
            </div>
          </MenuItem>

          {/* Вакансии */}
          <MenuItem setActive={setActive} active={active} item="Вакансии">
            <div className="grid grid-cols-2 gap-4 p-1">
              <ProductItem
                title="Все вакансии"
                description="Список открытых позиций и их статусы"
                href="/prototype/vacancy"
                icon={<Briefcase className="size-6" />}
              />
              <ProductItem
                title="Новая вакансия"
                description="Создать позицию из текста или аудио-брифинга"
                href="/vacancies/new"
                icon={<Sparkles className="size-6" />}
                gradient="from-indigo-500/80 to-blue-400/70"
              />
            </div>
          </MenuItem>

          {/* Матчинг */}
          <MenuItem setActive={setActive} active={active} item="Матчинг">
            <div className="grid grid-cols-2 gap-4 p-1">
              <ProductItem
                title="Семантический поиск"
                description="Найти похожих кандидатов по запросу «как…»"
                href="/prototype/candidates"
                icon={<Search className="size-6" />}
                gradient="from-emerald-500/80 to-teal-400/70"
              />
              <ProductItem
                title="Подбор под вакансию"
                description="Ранжированный пул с объяснениями и пробелами"
                href="/prototype/vacancy"
                icon={<Target className="size-6" />}
              />
            </div>
          </MenuItem>

          {/* Аналитика */}
          <MenuItem setActive={setActive} active={active} item="Аналитика">
            <div className="flex flex-col gap-3">
              <HoveredLink href="/prototype/dashboard">Дашборд</HoveredLink>
              <HoveredLink href="/prototype/pipeline">Этапы (воронка)</HoveredLink>
              <HoveredLink href="/prototype/candidate">Анализ портфолио</HoveredLink>
            </div>
          </MenuItem>
        </Menu>
      </div>

      {/* Немного контента под навбаром, чтобы панель раскрывалась поверх */}
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Users className="size-5" />
        </div>
        <h2 className="text-lg font-semibold">Наведи на пункты меню выше</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Панель раскрывается по наведению и плавно меняет размер при переходе между разделами.
          Ссылки ведут на реальные и прототипные экраны.
        </p>
      </div>
    </PrototypeShell>
  );
}
