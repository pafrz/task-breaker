"use client";

// ─── UI プリミティブ ────────────────────────────────────────────────────────
// 紙・鉛筆・付箋・スタンプの質感を作る最小部品群。
// ここに手描き感を閉じ込めて、画面側は組み立てるだけにする。

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { playTap } from "./lib";

// ─── Portal ─────────────────────────────────────────────────────────────────
// framer-motion が祖先に transform を付けると position:fixed の基準が
// ビューポートではなくその要素になる。全画面の演出は body 直下に逃がす。

// 呼び出し側は「演出中だけ」マウントするため、初期描画では常に何も出ない。
// よってサーバー(null)とクライアントで不一致は起きない。
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

// ─── 紙カード ───────────────────────────────────────────────────────────────

export function PaperCard({
  children,
  className = "",
  tilt = 0,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
}) {
  return (
    <div
      className={`paper hand-round ${className}`}
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      {children}
    </div>
  );
}

// ─── ボタン ─────────────────────────────────────────────────────────────────

export function InkButton({
  children,
  onClick,
  variant = "ink",
  size = "lg",
  disabled = false,
  className = "",
  glow = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ink" | "moon" | "paper";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  glow?: boolean;
  type?: "button" | "submit";
}) {
  const pad =
    size === "sm"
      ? "px-3.5 py-2 text-xs"
      : size === "md"
      ? "px-5 py-2.5 text-sm"
      : "px-6 py-4 text-[15px]";
  const cls =
    variant === "ink" ? "btn-ink" : variant === "moon" ? "btn-moon" : "btn-paper";

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        playTap();
        onClick?.();
      }}
      className={`hand-round-sm font-bold tracking-wide ${cls} ${pad} ${
        glow && !disabled ? "glow-pulse" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

// ─── スタンプ ───────────────────────────────────────────────────────────────
// 「決定」「合格」を押した実感を出す。-10度に傾いた二重枠。

export function Stamp({
  text,
  sub,
  tone = "sage",
  size = "md",
}: {
  text: string;
  sub?: string;
  tone?: "sage" | "clay" | "moon";
  size?: "sm" | "md" | "lg";
}) {
  const color =
    tone === "sage" ? "#6E8F72" : tone === "clay" ? "#C4694E" : "#B98D2C";
  const dim =
    size === "sm"
      ? { w: 92, t: 15, s: 9 }
      : size === "lg"
      ? { w: 152, t: 26, s: 12 }
      : { w: 122, t: 21, s: 11 };

  return (
    <div className="stamp-down inline-block" style={{ color }}>
      <div className="stamp-shake">
        <div
          className="flex flex-col items-center justify-center hand-round"
          style={{
            width: dim.w,
            height: dim.w * 0.62,
            border: `3px solid ${color}`,
            boxShadow: `inset 0 0 0 3px ${color}22, inset 0 0 0 4.5px ${color}`,
            opacity: 0.92,
          }}
        >
          <span
            className="font-bold leading-none"
            style={{ fontSize: dim.t, letterSpacing: "0.06em" }}
          >
            {text}
          </span>
          {sub && (
            <span
              className="mt-1 font-bold leading-none opacity-80"
              style={{ fontSize: dim.s, letterSpacing: "0.1em" }}
            >
              {sub}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 手描きチェック ─────────────────────────────────────────────────────────
// stroke-dasharray でペンが走る演出。完了トグルの手応え。

export function HandCheck({
  size = 22,
  color = "#6E8F72",
  animate = true,
}: {
  size?: number;
  color?: string;
  animate?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4.5 13.2 C6.4 14.6 8.1 16.4 9.6 19 C12.4 12.6 15.8 8.1 20 5.2"
        stroke={color}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "draw-stroke" : ""}
        style={{ ["--dash" as string]: "34" }}
      />
    </svg>
  );
}

// ─── 手描き下線 ─────────────────────────────────────────────────────────────

export function HandUnderline({
  width = 120,
  color = "#E9B94C",
  thickness = 3,
}: {
  width?: number;
  color?: string;
  thickness?: number;
}) {
  return (
    <svg width={width} height={9} viewBox={`0 0 ${width} 9`} fill="none">
      <path
        d={`M2 6.2 C ${width * 0.22} 2.4, ${width * 0.45} 7.6, ${width * 0.68} 4.2 S ${
          width * 0.88
        } 6.8, ${width - 2} 3.6`}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

// ─── 手描き囲みの番号 ───────────────────────────────────────────────────────

export function IndexCircle({
  n,
  active = false,
  done = false,
  size = 26,
}: {
  n: number;
  active?: boolean;
  done?: boolean;
  size?: number;
}) {
  const color = done ? "#6E8F72" : active ? "#B98D2C" : "currentColor";
  return (
    <span
      className="relative inline-flex flex-shrink-0 items-center justify-center font-bold"
      style={{ width: size, height: size, fontSize: size * 0.44, color }}
    >
      <svg
        className="absolute inset-0"
        viewBox="0 0 32 32"
        fill="none"
        style={{ opacity: done || active ? 0.85 : 0.4 }}
      >
        <path
          d="M16 2.6 C24.4 2.6 29.6 8.4 29.4 16.4 C29.2 24.4 23.6 29.6 15.6 29.4 C7.6 29.2 2.6 23.8 2.8 15.8 C3 7.8 8.2 2.7 16 2.6 Z"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="relative">{n}</span>
    </span>
  );
}

// ─── 分バッジ ───────────────────────────────────────────────────────────────

export function MinuteChip({
  minutes,
  tone = "plain",
}: {
  minutes: number;
  tone?: "plain" | "moon" | "sage";
}) {
  const cls =
    tone === "moon"
      ? "text-moon-deep"
      : tone === "sage"
      ? "text-sage"
      : "text-ink-soft";
  return (
    <span
      className={`hand-round-sm pencil-dash flex-shrink-0 px-2 py-0.5 text-[11px] font-bold tabular-nums ${cls}`}
    >
      {minutes}<span className="ml-0.5 text-[9px] opacity-70">分</span>
    </span>
  );
}

// ─── ステップレール ─────────────────────────────────────────────────────────
// 6段階の現在地。鉛筆の破線に節が並ぶ。通過済みは戻れる。

export const STEP_LABELS = [
  "課題を書く",
  "AIが分解",
  "合格ライン",
  "タスクを選ぶ",
  "集中する",
  "振り返り",
] as const;

export function StepRail({
  current,
  maxReached,
  onJump,
}: {
  current: number; // 1-6
  maxReached: number;
  onJump?: (step: number) => void;
}) {
  return (
    <div className="select-none">
      <div className="relative flex items-center justify-between px-1">
        {/* 破線のレール */}
        <div
          className="absolute left-3 right-3 top-1/2 -translate-y-1/2"
          style={{
            height: 0,
            borderTop: "1.5px dashed var(--pencil-strong)",
          }}
        />
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const isPast = n < current;
          const isNow = n === current;
          const reachable = n <= maxReached && !!onJump;
          return (
            <button
              key={label}
              disabled={!reachable || isNow}
              onClick={() => reachable && onJump?.(n)}
              aria-label={`${n}. ${label}`}
              aria-current={isNow ? "step" : undefined}
              className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 ${
                reachable && !isNow ? "cursor-pointer" : "cursor-default"
              }`}
              style={{
                width: isNow ? 26 : 16,
                height: isNow ? 26 : 16,
                background: isNow
                  ? "var(--color-moon)"
                  : isPast
                  ? "var(--color-ink)"
                  : "var(--page-bg)",
                border: isNow
                  ? "2px solid var(--color-moon-deep)"
                  : isPast
                  ? "1.5px solid var(--color-ink)"
                  : "1.5px solid var(--pencil-strong)",
                boxShadow: isNow ? "0 0 0 4px rgba(233,185,76,0.22)" : "none",
              }}
            >
              {isNow && (
                <span className="text-[11px] font-bold leading-none text-[#2a1f06]">
                  {n}
                </span>
              )}
              {isPast && <HandCheck size={10} color="#FBF7EC" animate={false} />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] font-bold tracking-widest text-ink-soft">
        STEP {current} / 6 ・ {STEP_LABELS[current - 1]}
      </p>
    </div>
  );
}

// ─── 紙吹雪（紙片） ─────────────────────────────────────────────────────────
// 丸い紙・四角い紙・星の混合。落ち方は控えめ。

export function PaperScraps({ count = 34 }: { count?: number }) {
  const colors = ["#E9B94C", "#6E8F72", "#C4694E", "#F6DFA0", "#FBF7EC", "#8FA9CE"];
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.7,
    dur: 2.2 + Math.random() * 1.6,
    color: colors[i % colors.length],
    w: 6 + Math.random() * 7,
    h: 8 + Math.random() * 8,
    spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 420),
    round: Math.random() > 0.6,
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="scrap"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.round ? p.w : p.h,
            background: p.color,
            borderRadius: p.round ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            ["--spin" as string]: `${p.spin}deg`,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}

// ─── セクション見出し ───────────────────────────────────────────────────────

export function Heading({
  children,
  sub,
  underline = true,
}: {
  children: ReactNode;
  sub?: string;
  underline?: boolean;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold leading-snug tracking-wide">{children}</h2>
      {underline && (
        <div className="-mt-0.5">
          <HandUnderline width={92} />
        </div>
      )}
      {sub && <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{sub}</p>}
    </div>
  );
}

// ─── 進捗ゲージ（紙のメーター） ─────────────────────────────────────────────

export function PaperGauge({
  value,
  max,
  tone = "moon",
}: {
  value: number;
  max: number;
  tone?: "moon" | "sage" | "clay";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill =
    tone === "sage" ? "#6E8F72" : tone === "clay" ? "#C4694E" : "#E9B94C";
  return (
    <div
      className="relative h-3.5 w-full overflow-hidden"
      style={{
        borderRadius: 99,
        border: "1.5px solid var(--pencil-strong)",
        background: "transparent",
      }}
    >
      <motion.div
        className="h-full"
        style={{ background: fill, borderRadius: 99 }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 18 }}
      />
    </div>
  );
}

// ─── 数値のカウントアップ表示 ───────────────────────────────────────────────

export function BigCount({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  return (
    <div className="flex items-end justify-center gap-1 tabular-nums">
      <motion.span
        key={value}
        initial={{ y: -14, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        className="font-mono text-6xl font-bold leading-none"
      >
        {String(value).padStart(2, "0")}
      </motion.span>
      <span className="mb-1 font-mono text-2xl font-bold leading-none text-ink-faint">
        /{String(total).padStart(2, "0")}
      </span>
    </div>
  );
}
