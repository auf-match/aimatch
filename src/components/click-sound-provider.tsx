"use client";

/**
 * Звук нажатия.
 *
 * Два источника: основное действие играет файл /click.mp3, всё остальное —
 * процедурные пресеты из ui-sounds.js (github.com/mishanaer/sound), которые
 * синтезируются на лету и не требуют загрузки.
 *
 * Один делегированный слушатель на документе, а не обработчик на каждой
 * кнопке: динамически отрисованные элементы (модалки, выпадающие списки,
 * строки таблиц) подхватываются сами, без правок в местах отрисовки.
 *
 * Для файла — Web Audio, а не <audio>: тег переиспользует один источник,
 * поэтому быстрые клики обрывают друг друга, а первое воспроизведение идёт
 * с задержкой на декодирование. Здесь файл декодируется один раз, дальше
 * каждый клик — новый дешёвый источник поверх общего буфера.
 */
import { useEffect, useRef } from "react";
import {
  resolveClickSound,
  CLICK_TARGET_SELECTOR,
} from "@/lib/click-sound";
import { playUISound } from "@/lib/ui-sounds";

export interface ClickSoundOptions {
  enabled?: boolean;
  /** 0…1 */
  volume?: number;
  /** Скорость: >1 делает щелчок короче и суше */
  rate?: number;
  /** Обрезка хвоста, мс. 0 — играть файл целиком */
  maxMs?: number;
  src?: string;
}

/** Минимальный зазор между щелчками, мс — защита от слитного треска. */
const MIN_GAP_MS = 40;

/** Громкость, при которой процедурные пресеты звучат «как задумано». */
const DEFAULT_VOLUME = 0.4;

const now = () => performance.now();

class ClickSoundPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private lastPlayedAt = 0;

  constructor(private src: string) {}

  /** Декодируем заранее, чтобы первый клик не ждал сеть. */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const res = await fetch(this.src);
      const bytes = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(bytes);
    })().catch((err) => {
      console.warn("[click-sound] не удалось загрузить звук:", err);
    });
    return this.loading;
  }

  play({ volume = 0.4, rate = 1, maxMs = 0 }: ClickSoundOptions = {}) {
    if (!this.ctx || !this.buffer) return;

    const now = performance.now();
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    // Браузер держит контекст приостановленным до жеста пользователя.
    // Клик и есть жест, поэтому возобновляем прямо здесь.
    if (this.ctx.state === "suspended") void this.ctx.resume();

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.ctx.destination);

    source.start();
    if (maxMs > 0) {
      // Гасим по рампе, а не резким stop: обрыв даёт щелчок поверх щелчка.
      const end = this.ctx.currentTime + maxMs / 1000;
      gain.gain.setValueAtTime(volume, Math.max(this.ctx.currentTime, end - 0.02));
      gain.gain.linearRampToValueAtTime(0, end);
      source.stop(end + 0.01);
    }
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
    this.loading = null;
  }
}

export function ClickSoundProvider({
  enabled = true,
  volume = 0.4,
  rate = 1,
  maxMs = 0,
  src = "/click.mp3",
}: ClickSoundOptions) {
  // Настройки читаем через ref, чтобы смена громкости не пересоздавала
  // слушатель и не роняла уже декодированный буфер.
  const opts = useRef({ enabled, volume, rate, maxMs });
  opts.current = { enabled, volume, rate, maxMs };

  useEffect(() => {
    const player = new ClickSoundPlayer(src);
    void player.preload();
    let lastProceduralAt = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (!opts.current.enabled) return;
      // Только основная кнопка мыши: правый клик открывает меню, не нажимает.
      if (e.button !== 0) return;

      const el = (e.target as Element | null)?.closest?.(CLICK_TARGET_SELECTOR);
      if (!el) return;

      const sound = resolveClickSound({
        tag: el.tagName,
        marker: el.getAttribute("data-click-sound"),
        role: el.getAttribute("role"),
        type: el.getAttribute("type"),
        disabled:
          "disabled" in el && Boolean((el as HTMLButtonElement).disabled),
        ariaDisabled: el.getAttribute("aria-disabled"),
      });
      if (!sound) return;

      if (sound === "primary") {
        player.play(opts.current);
        return;
      }

      // Процедурные звуки заметно тише файла, поэтому громкость учитываем
      // через intensity: при volume 0.4 они иначе почти не слышны.
      if (now() - lastProceduralAt < MIN_GAP_MS) return;
      lastProceduralAt = now();
      playUISound(sound, opts.current.volume / DEFAULT_VOLUME);
    };

    // pointerdown, а не click: звук должен совпадать с моментом нажатия,
    // иначе на медленных обработчиках он отстаёт и кажется чужим.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      player.dispose();
    };
  }, [src]);

  return null;
}
