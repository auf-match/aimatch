"use client";

/**
 * Зона загрузки файла.
 *
 * Анатомия из 21st.dev/@extend-hq/file-upload-2: карточка с пунктирной
 * областью внутри, стопка карточек со стрелкой, кнопка выбора.
 *
 * Прогресс здесь не имитируется: в продукте за ход обработки отвечают
 * состояния вызывающей страницы (расшифровка, разбор), и рисовать поверх
 * них ещё одну полосу — врать пользователю.
 */
import { useRef, useState } from "react";

function StackIcon({ over }: { over: boolean }) {
  const card =
    "absolute top-1/2 left-1/2 grid h-[46px] w-[46px] place-items-center rounded-[11px] border transition-transform duration-300";
  return (
    <div className="relative mb-4 h-[54px]" aria-hidden>
      <span
        className={`${card} border-border bg-secondary/40`}
        style={{
          transform: `translate(-50%,-50%) translateX(${over ? -25 : -18}px) rotate(${over ? -14 : -9}deg)`,
        }}
      />
      <span
        className={`${card} border-border bg-secondary/40`}
        style={{
          transform: `translate(-50%,-50%) translateX(${over ? 25 : 18}px) rotate(${over ? 14 : 9}deg)`,
        }}
      />
      <span
        className={`${card} bg-card ${over ? "border-[#F97029]/60 text-[#F97029]" : "border-border text-foreground"}`}
        style={{ transform: "translate(-50%,-50%)" }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[21px] w-[21px]">
          <path
            d="M14.5 3.5H7.5a2 2 0 00-2 2v13a2 2 0 002 2h9a2 2 0 002-2V7.5z"
            stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
          />
          <path
            d="M12 16.5v-6m0 0l-2.2 2.2M12 10.5l2.2 2.2"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

export function DropZone({
  accept,
  formats,
  maxMb,
  onFile,
  disabled,
  title = "Нажми или перетащи файл",
}: {
  /** Список расширений через запятую, как у input: ".pdf,.docx" */
  accept: string;
  /** Что показать человеку: "PDF или DOCX" */
  formats: string;
  maxMb: number;
  onFile: (file: File) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!accept.includes(ext)) {
      setError(`Формат .${ext} не подходит — нужен ${formats}`);
      return;
    }
    if (f.size > maxMb * 1024 * 1024) {
      setError(`Файл больше ${maxMb} МБ`);
      return;
    }
    setError("");
    onFile(f);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-border bg-card p-2.5 transition-colors ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        <div
          className={`rounded-lg border border-dashed px-5 py-9 text-center transition-colors ${
            over ? "border-[#F97029]/60 bg-[#F97029]/[0.05]" : "border-border"
          }`}
        >
          <StackIcon over={over} />
          <p className="t-card-title text-[15px]">{over ? "Отпусти файл" : title}</p>
          <p className="t-caption mt-1 font-mono">
            {formats} · до {maxMb} МБ
          </p>
          <span className="t-body-sm mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 transition-colors hover:bg-secondary">
            <svg viewBox="0 0 24 24" fill="none" className="h-[15px] w-[15px]">
              <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v1.5A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Выбрать файл
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p className="t-caption mt-2 text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
