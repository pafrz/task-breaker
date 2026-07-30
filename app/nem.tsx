"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { playPop } from "./lib";

// ─── Nem: マスコットキャラクター ────────────────────────────────────────────
// 三日月の妖精。徹夜するユーザーを心配し、寝てくれたら喜ぶ。
// 6表情 × 17状態のセリフライブラリ。深夜モードは"上書き"ではなく"差し替え"制。
//
// 画像差し替え可能：`public/nem/{expression}.png` を置くと自動で優先表示。
// PNG が無い場合はビルトインSVGにフォールバック。
//   public/nem/default.png
//   public/nem/happy.png
//   public/nem/worried.png
//   public/nem/sleepy.png
//   public/nem/celebrating.png
//   public/nem/panicking.png

export type NemExpression =
  | "default"
  | "happy"
  | "worried"
  | "sleepy"
  | "celebrating"
  | "panicking";

export type NemState =
  | "empty"
  | "typing"
  | "ai-thinking"
  | "after-breakdown"
  | "passline-set"
  | "timer-idle"
  | "timer-running"
  | "overtime-just"
  | "overtime-15"
  | "overtime-30"
  | "task-complete"
  | "all-done"
  | "review-yes"
  | "review-no"
  | "demo-loaded"
  | "focus-empty"
  | "deep-night"
  | "past-midnight"
  // ─── 6ステップ体験フロー用 ───
  | "step-input"
  | "passline-ask"
  | "passline-heavy"
  | "select-ask"
  | "task-chosen"
  | "focus-watching"
  | "focus-standby"
  | "overtime-reflect"
  | "goal-reached"
  | "review-ask"
  | "day-closed";

// ─── SVG data ──────────────────────────────────────────────────────────────

const NEM_SVG: Record<NemExpression, string> = {
  default: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M 55,14 A 38,38 0 1,0 55,90 A 50,50 0 0,1 55,14 Z" fill="#B88A3E"/><path d="M 55,12 A 38,38 0 1,0 55,88 A 50,50 0 0,1 55,12 Z" fill="#FFECB0" stroke="#B88A3E" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="30" cy="26" rx="4.5" ry="2" fill="#FFF8DC" opacity="0.9" transform="rotate(-25 30 26)"/><ellipse cx="17" cy="53" rx="2.6" ry="1.8" fill="#FFB5C5" opacity="0.6"/><ellipse cx="36" cy="53" rx="2.6" ry="1.8" fill="#FFB5C5" opacity="0.6"/><ellipse cx="23" cy="46" rx="2.3" ry="2.9" fill="#3B2A1A"/><ellipse cx="33" cy="46" rx="2.3" ry="2.9" fill="#3B2A1A"/><circle cx="24" cy="44.8" r="0.9" fill="#FFFFFF"/><circle cx="34" cy="44.8" r="0.9" fill="#FFFFFF"/><path d="M 25,55 Q 28,57.6 31,55" stroke="#3B2A1A" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`,
  happy: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M 55,14 A 38,38 0 1,0 55,90 A 50,50 0 0,1 55,14 Z" fill="#B88A3E"/><path d="M 55,12 A 38,38 0 1,0 55,88 A 50,50 0 0,1 55,12 Z" fill="#FFECB0" stroke="#B88A3E" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="30" cy="26" rx="4.5" ry="2" fill="#FFF8DC" opacity="0.9" transform="rotate(-25 30 26)"/><ellipse cx="16.5" cy="53" rx="3.3" ry="2.3" fill="#FF97AC" opacity="0.9"/><ellipse cx="36.5" cy="53" rx="3.3" ry="2.3" fill="#FF97AC" opacity="0.9"/><path d="M 19,47 Q 23,41.8 27,47" stroke="#3B2A1A" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M 29,47 Q 33,41.8 37,47" stroke="#3B2A1A" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M 22,54 Q 28,60.5 34,54" stroke="#3B2A1A" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`,
  worried: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M 55,14 A 38,38 0 1,0 55,90 A 50,50 0 0,1 55,14 Z" fill="#B88A3E"/><path d="M 55,12 A 38,38 0 1,0 55,88 A 50,50 0 0,1 55,12 Z" fill="#FFECB0" stroke="#B88A3E" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="30" cy="26" rx="4.5" ry="2" fill="#FFF8DC" opacity="0.9" transform="rotate(-25 30 26)"/><path d="M 18,41.5 Q 21.5,39.2 25.5,39.2" stroke="#3B2A1A" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M 30.5,39.2 Q 34.5,39.2 38,41.5" stroke="#3B2A1A" stroke-width="1.6" stroke-linecap="round" fill="none"/><ellipse cx="17" cy="54" rx="2.6" ry="1.7" fill="#FFB5C5" opacity="0.55"/><ellipse cx="36" cy="54" rx="2.6" ry="1.7" fill="#FFB5C5" opacity="0.55"/><ellipse cx="23" cy="47" rx="2.5" ry="3.1" fill="#3B2A1A"/><ellipse cx="33" cy="47" rx="2.5" ry="3.1" fill="#3B2A1A"/><circle cx="22" cy="45.6" r="1.15" fill="#FFFFFF"/><circle cx="32" cy="45.6" r="1.15" fill="#FFFFFF"/><circle cx="24.2" cy="48.3" r="0.55" fill="#FFFFFF"/><circle cx="34.2" cy="48.3" r="0.55" fill="#FFFFFF"/><path d="M 20,51 C 17.4,54.6 17.4,57.2 20,58.3 C 22.6,57.2 22.6,54.6 20,51 Z" fill="#8FD3EE" stroke="#5FB4D8" stroke-width="0.5" stroke-linejoin="round"/><circle cx="19.2" cy="55.4" r="0.55" fill="#FFFFFF" opacity="0.9"/><path d="M 24,56.2 Q 28,53.5 32,56.2" stroke="#3B2A1A" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`,
  sleepy: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M 55,14 A 38,38 0 1,0 55,90 A 50,50 0 0,1 55,14 Z" fill="#B88A3E"/><path d="M 55,12 A 38,38 0 1,0 55,88 A 50,50 0 0,1 55,12 Z" fill="#FFECB0" stroke="#B88A3E" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="30" cy="26" rx="4.5" ry="2" fill="#FFF8DC" opacity="0.9" transform="rotate(-25 30 26)"/><ellipse cx="16.5" cy="54" rx="2.9" ry="1.9" fill="#FFB5C5" opacity="0.65"/><ellipse cx="36.5" cy="54" rx="2.9" ry="1.9" fill="#FFB5C5" opacity="0.65"/><path d="M 19,45.8 Q 23,49.4 27,45.8" stroke="#3B2A1A" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M 29,45.8 Q 33,49.4 37,45.8" stroke="#3B2A1A" stroke-width="1.7" fill="none" stroke-linecap="round"/><ellipse cx="28" cy="56.2" rx="1.3" ry="1.7" fill="#3B2A1A"/><path d="M 60,42 L 68,42 L 60,50 L 68,50" stroke="#A0C6E0" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M 70,28 L 76,28 L 70,34 L 76,34" stroke="#A0C6E0" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M 78,15 L 82,15 L 78,19 L 82,19" stroke="#A0C6E0" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  celebrating: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M 55,14 A 38,38 0 1,0 55,90 A 50,50 0 0,1 55,14 Z" fill="#B88A3E"/><path d="M 55,12 A 38,38 0 1,0 55,88 A 50,50 0 0,1 55,12 Z" fill="#FFECB0" stroke="#B88A3E" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="30" cy="26" rx="4.5" ry="2" fill="#FFF8DC" opacity="0.9" transform="rotate(-25 30 26)"/><ellipse cx="16.5" cy="53.5" rx="3.1" ry="2.1" fill="#FF97AC" opacity="0.9"/><ellipse cx="36.5" cy="53.5" rx="3.1" ry="2.1" fill="#FF97AC" opacity="0.9"/><ellipse cx="23" cy="46" rx="2.9" ry="3.5" fill="#3B2A1A"/><ellipse cx="33" cy="46" rx="2.9" ry="3.5" fill="#3B2A1A"/><circle cx="24.2" cy="44.4" r="1.35" fill="#FFFFFF"/><circle cx="34.2" cy="44.4" r="1.35" fill="#FFFFFF"/><circle cx="21.6" cy="47.8" r="0.65" fill="#FFFFFF"/><circle cx="31.6" cy="47.8" r="0.65" fill="#FFFFFF"/><path d="M 22,53.5 Q 28,61.2 34,53.5 Q 28,58.2 22,53.5 Z" fill="#3B2A1A"/><path d="M 27,57.4 Q 28,59.8 29,57.4 Z" fill="#FF6B85"/><path d="M 68,22 L 69.2,25 L 72.5,25.5 L 69.2,26 L 68,29 L 66.8,26 L 63.5,25.5 L 66.8,25 Z" fill="#FFD766" stroke="#E0B040" stroke-width="0.4" stroke-linejoin="round"/><path d="M 80,52 L 81,54.5 L 83.5,55 L 81,55.5 L 80,58 L 79,55.5 L 76.5,55 L 79,54.5 Z" fill="#FFD766" stroke="#E0B040" stroke-width="0.4" stroke-linejoin="round"/><path d="M 63,78 L 64,80 L 66,80.5 L 64,81 L 63,83 L 62,81 L 60,80.5 L 62,80 Z" fill="#FFD766" stroke="#E0B040" stroke-width="0.4" stroke-linejoin="round"/><circle cx="75" cy="35" r="1.2" fill="#FFD766"/><circle cx="86" cy="70" r="1" fill="#FFD766"/><circle cx="70" cy="62" r="0.8" fill="#FFD766"/></svg>`,
  panicking: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M 55,14 A 38,38 0 1,0 55,90 A 50,50 0 0,1 55,14 Z" fill="#B88A3E"/><path d="M 55,12 A 38,38 0 1,0 55,88 A 50,50 0 0,1 55,12 Z" fill="#FFECB0" stroke="#B88A3E" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="30" cy="26" rx="4.5" ry="2" fill="#FFF8DC" opacity="0.9" transform="rotate(-25 30 26)"/><path d="M 18,40.5 Q 22,37.5 25.5,38.5" stroke="#3B2A1A" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M 30.5,38.5 Q 34,37.5 38,40.5" stroke="#3B2A1A" stroke-width="1.7" stroke-linecap="round" fill="none"/><ellipse cx="23" cy="47" rx="3" ry="3.5" fill="#FFFFFF" stroke="#3B2A1A" stroke-width="1.1"/><ellipse cx="33" cy="47" rx="3" ry="3.5" fill="#FFFFFF" stroke="#3B2A1A" stroke-width="1.1"/><circle cx="23" cy="47.6" r="1.15" fill="#3B2A1A"/><circle cx="33" cy="47.6" r="1.15" fill="#3B2A1A"/><path d="M 21,56.2 L 23,54.2 L 25,56.2 L 27,54.2 L 29,56.2 L 31,54.2 L 33,56.2" stroke="#3B2A1A" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M 44,28 C 41.8,31.6 41.8,34.2 44,35.4 C 46.2,34.2 46.2,31.6 44,28 Z" fill="#8FD3EE" stroke="#5FB4D8" stroke-width="0.5" stroke-linejoin="round"/><ellipse cx="43.2" cy="32" rx="0.5" ry="0.8" fill="#FFFFFF" opacity="0.9"/><path d="M 52,22 L 55,25" stroke="#8FD3EE" stroke-width="1.2" stroke-linecap="round"/><path d="M 48,18 L 50,20" stroke="#8FD3EE" stroke-width="1" stroke-linecap="round"/></svg>`,
};

// ─── Dialogue library ──────────────────────────────────────────────────────
// state → (expression, line)。深夜モードは deep-night / past-midnight で "差し替え"。

type DialogueLine = { expression: NemExpression; line: string };

export const DIALOGUE: Record<NemState, DialogueLine> = {
  empty:            { expression: "default",     line: "今日は何にとりかかろっか？ ネム、一緒に考えるよ。" },
  typing:           { expression: "happy",       line: "うんうん、書いてるね。ゆっくりでいいよ。" },
  "ai-thinking":    { expression: "sleepy",      line: "うーん…今、細かくちぎってるとこ。待っててね。" },
  "after-breakdown":{ expression: "default",     line: "分けられたよ。どこまでできたら合格にする？" },
  "passline-set":   { expression: "happy",       line: "合格ライン、覚えたよ。それ超えたら十分えらい。" },
  "timer-idle":     { expression: "default",     line: "始める前に、深呼吸ひとつしよっか。" },
  "timer-running":  { expression: "happy",       line: "ネム、ここで見てるね。集中していいよ。" },
  "overtime-just":  { expression: "worried",     line: "予定の時間、ちょっと過ぎたよ。区切り、どこにする？" },
  "overtime-15":    { expression: "worried",     line: "15分オーバーだよ。一回、肩の力抜いてみて。" },
  "overtime-30":    { expression: "panicking",   line: "ねえ、もう十分がんばったよ。今夜はここで寝よ？" },
  "task-complete":  { expression: "celebrating", line: "できたね！ ネム、ちゃんと見てたよ。" },
  "all-done":       { expression: "celebrating", line: "全部終わったよ！ ちょっとだけ振り返ってみる？" },
  "review-yes":     { expression: "celebrating", line: "合格ライン超えたね。今日の自分、褒めていいよ。" },
  "review-no":      { expression: "worried",     line: "届かなかった日もあるよ。ここまで来たのは本当。" },
  "demo-loaded":    { expression: "happy",       line: "サンプル、置いといたよ。触って感じ、掴んでみて。" },
  "focus-empty":    { expression: "default",     line: "まだ集中してないよ。「今日」からタスクを選んでね。" },
  "deep-night":     { expression: "sleepy",      line: "もうこんな時間だよ…続きは明日のネムと一緒に。" },
  "past-midnight":  { expression: "sleepy",      line: "日付、変わったよ…。 明日の自分、疲れちゃうよ？" },

  // ─── 6ステップ体験フロー ───
  "step-input":     { expression: "default",     line: "おつかれさま。\n今日は、何に取りかかる？" },
  "passline-ask":   { expression: "default",     line: "今日はどこまでやったら合格にする？\n全部じゃなくていいよ。" },
  "passline-heavy": { expression: "worried",     line: "ちょっと多いかも。\n減らしても、ネムは怒らないよ。" },
  "select-ask":     { expression: "default",     line: "どれから始めようか。\nひとつ選んで。" },
  "task-chosen":    { expression: "happy",       line: "うん、それにしよう。\nいけるよ、いってみよう。" },
  "focus-standby":  { expression: "default",     line: "深呼吸ひとつ。\n準備できたら押して。" },
  "focus-watching": { expression: "sleepy",      line: "ここで見てるね。" },
  "overtime-reflect":{ expression: "worried",    line: "時間、過ぎたよ。\nどうする？ 決めるのはきみだよ。" },
  "goal-reached":   { expression: "celebrating", line: "今日の合格ライン、\n超えたよ！ ちゃんと見てた。" },
  "review-ask":     { expression: "happy",       line: "今日はここまで。\n安心して終わっていいよ。" },
  "day-closed":     { expression: "sleepy",      line: "おやすみ。\nまた明日ね。" },
};

// 深夜に「夜だよ」を差し込む状態。各ステップの固有セリフは潰さず、
// 待ち時間のある状態だけ夜モードのことばに差し替える。
const NIGHT_SWAP_STATES: NemState[] = [
  "empty",
  "typing",
  "step-input",
  "timer-idle",
  "focus-standby",
  "select-ask",
];

// 深夜でも一言そえるだけにする状態（固有セリフを残す）
const NIGHT_APPEND_STATES: NemState[] = [
  "after-breakdown",
  "passline-ask",
  "task-chosen",
  "review-ask",
];

export function resolveDialogue(
  state: NemState,
  isDeepNight: boolean,
  isPastMidnight: boolean,
): DialogueLine {
  const base = DIALOGUE[state];
  if (!isDeepNight) return base;

  if (NIGHT_SWAP_STATES.includes(state)) {
    return isPastMidnight ? DIALOGUE["past-midnight"] : DIALOGUE["deep-night"];
  }
  if (NIGHT_APPEND_STATES.includes(state)) {
    return {
      expression: isPastMidnight ? "sleepy" : base.expression,
      line: `${base.line}\n${isPastMidnight ? "…もう日付、変わってるよ。" : "…もう夜だから、少なめでもいいと思う。"}`,
    };
  }
  return base;
}

// ─── Nem component ─────────────────────────────────────────────────────────

export function Nem({
  expression = "default",
  size = 100,
  className = "",
  floating = true,
}: {
  expression?: NemExpression;
  size?: number;
  className?: string;
  floating?: boolean;
}) {
  // PNG が存在すれば PNG、失敗したら SVG フォールバック
  const [pngFailed, setPngFailed] = useState(false);

  const style = { width: size, height: size };

  // 呼吸は外側、まばたき(縦つぶれ)は内側。同一要素に animation を2つ当てると
  // 片方しか効かないので階層を分ける。
  return (
    <div
      className={`inline-block flex-shrink-0 ${floating ? "nem-breathe" : ""} ${className}`}
      style={style}
    >
      <div className={floating ? "nem-blink" : ""} style={style}>
        {!pngFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/nem/${expression}.png`}
            alt={`ネム (${expression})`}
            onError={() => setPngFailed(true)}
            style={{ ...style, objectFit: "contain" }}
            draggable={false}
          />
        ) : (
          <div
            role="img"
            aria-label={`ネム (${expression})`}
            style={style}
            dangerouslySetInnerHTML={{ __html: NEM_SVG[expression] }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Hidden tap lines ───────────────────────────────────────────────────────
// ネムをタップした時にランダムで出る隠しセリフ

export const HIDDEN_LINES = [
  "わっ、びっくりした。",
  "なでてくれるの？えへへ。",
  "ネム、ここにいるよ。",
  "ちょっとくすぐったいよ。",
  "きみが頑張ってるの、見てる。",
  "無理してない？大丈夫？",
  "ふぁ…ちょっと眠くなってきた。",
  "月、きれいだね。",
  "またあとでね。",
  "きみのペースでいいんだよ。",
  "今日もおつかれさま。",
  "そばにいるからね。",
];

// ─── Ambient sparkles ────────────────────────────────────────────────────────
// ネムの周囲に舞う小さなキラキラ。celebrating時は数を増やす。

function Sparkles({ boost = false }: { boost?: boolean }) {
  const positions = boost
    ? [
        { top: "2%", left: "8%", size: 10, delay: 0 },
        { top: "10%", left: "82%", size: 12, delay: 0.4 },
        { top: "48%", left: "-4%", size: 9, delay: 0.8 },
        { top: "40%", left: "94%", size: 11, delay: 1.2 },
        { top: "82%", left: "12%", size: 8, delay: 0.6 },
        { top: "76%", left: "84%", size: 10, delay: 1.6 },
      ]
    : [
        { top: "6%", left: "80%", size: 9, delay: 0 },
        { top: "58%", left: "-2%", size: 8, delay: 1.1 },
        { top: "84%", left: "78%", size: 7, delay: 0.7 },
      ];
  return (
    <>
      {positions.map((p, i) => (
        <span
          key={i}
          className="sparkle"
          style={{ top: p.top, left: p.left, animationDelay: `${p.delay}s` }}
        >
          <svg width={p.size} height={p.size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
          </svg>
        </span>
      ))}
    </>
  );
}

// ─── Speech bubble ─────────────────────────────────────────────────────────
// tail: バブルのしっぽの位置。"left" = 左に出す、"right" = 右に出す、"none" = 出さない

export function SpeechBubble({
  text,
  tail = "left",
  tone = "light",
  className = "",
}: {
  text: string;
  tail?: "left" | "right" | "bottom" | "none";
  tone?: "light" | "night";
  className?: string;
}) {
  return (
    <div
      key={text}
      data-tone={tone}
      className={`paper hand-round bubble-in relative px-4 py-2.5 text-[13.5px] leading-relaxed ${className}`}
    >
      <span className="whitespace-pre-line">{text}</span>
      {tail !== "none" && (
        <div
          className={`paper absolute h-3.5 w-3.5 rotate-45 ${
            tail === "left"
              ? "-left-[7px] top-5"
              : tail === "right"
              ? "-right-[7px] top-5"
              : "-bottom-[7px] left-8"
          }`}
          style={{ borderRadius: 2, boxShadow: "none" }}
        />
      )}
    </div>
  );
}

// ─── Nem + Bubble combo ────────────────────────────────────────────────────
// 横並びで「ネム＋吹き出し」を表示する定型。size小/中/大の3種。

export function NemWithBubble({
  expression,
  text,
  size = 72,
  align = "left",
  tone = "light",
  className = "",
  interactive = true,
  sparkle,
}: {
  expression: NemExpression;
  text: string;
  size?: number;
  align?: "left" | "right";
  tone?: "light" | "night";
  className?: string;
  interactive?: boolean;
  sparkle?: boolean;
}) {
  // tap で一時的に隠しセリフ＆表情を上書き
  const [override, setOverride] = useState<{ expr: NemExpression; line: string } | null>(null);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const heartId = useRef(0);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showExpr = override?.expr ?? expression;
  const showText = override?.line ?? text;
  const doSparkle = sparkle ?? (showExpr === "celebrating");

  const handleTap = useCallback(() => {
    if (!interactive) return;
    playPop();
    const line = HIDDEN_LINES[Math.floor(Math.random() * HIDDEN_LINES.length)];
    setOverride({ expr: "happy", line });
    // ハートを飛ばす
    heartId.current += 1;
    const id = heartId.current;
    const x = 30 + Math.random() * 40; // 30-70%
    setHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 1100);
    // 2.4秒後に元へ
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setOverride(null), 2400);
  }, [interactive]);

  return (
    <div className={`flex items-start gap-2 ${align === "right" ? "flex-row-reverse" : ""} ${className}`}>
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        {doSparkle && <Sparkles boost={showExpr === "celebrating"} />}
        {hearts.map((h) => (
          <span key={h.id} className="heart-pop" style={{ left: `${h.x}%`, top: "20%", fontSize: size * 0.22 }}>
            💜
          </span>
        ))}
        <motion.div
          whileTap={interactive ? { scale: 0.88, rotate: -4 } : undefined}
          onClick={handleTap}
          className={interactive ? "cursor-pointer" : ""}
          style={{ width: size, height: size }}
        >
          <Nem expression={showExpr} size={size} />
        </motion.div>
      </div>
      <div className="mt-3 min-w-0 flex-1">
        <SpeechBubble
          text={showText}
          tail={align === "right" ? "right" : "left"}
          tone={tone}
        />
      </div>
    </div>
  );
}

// ─── NemStage ──────────────────────────────────────────────────────────────
// 各ステップで「ネムが反応している」ことを主役として見せるための舞台。
// 吹き出しはネムの右上（横並び）。表情が変わると差分がひと目で分かる。

export function NemStage({
  state,
  isDeepNight,
  isPastMidnight,
  size = 84,
  quiet = false,
  className = "",
  tone,
}: {
  state: NemState;
  isDeepNight: boolean;
  isPastMidnight: boolean;
  size?: number;
  /** 集中中など、吹き出しを最小化したいとき */
  quiet?: boolean;
  className?: string;
  /** 見た目だけ夜にしたい場合（セリフの深夜判定とは切り離す） */
  tone?: "light" | "night";
}) {
  const line = resolveDialogue(state, isDeepNight, isPastMidnight);
  const [override, setOverride] = useState<{ expr: NemExpression; line: string } | null>(null);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const heartId = useRef(0);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expr = override?.expr ?? line.expression;
  const text = override?.line ?? line.line;

  const handleTap = useCallback(() => {
    playPop();
    const l = HIDDEN_LINES[Math.floor(Math.random() * HIDDEN_LINES.length)];
    setOverride({ expr: "happy", line: l });
    heartId.current += 1;
    const id = heartId.current;
    setHearts((prev) => [...prev, { id, x: 24 + Math.random() * 44 }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 1100);
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setOverride(null), 2600);
  }, []);

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        {expr === "celebrating" && <Sparkles boost />}
        {hearts.map((h) => (
          <span
            key={h.id}
            className="heart-pop z-10"
            style={{ left: `${h.x}%`, top: "18%", fontSize: size * 0.2 }}
          >
            💛
          </span>
        ))}
        <motion.div
          whileTap={{ scale: 0.9, rotate: -5 }}
          onClick={handleTap}
          className="cursor-pointer"
          style={{ width: size, height: size }}
          title="なでる"
        >
          <Nem expression={expr} size={size} />
        </motion.div>
      </div>
      <div className={`min-w-0 flex-1 ${quiet ? "pt-1" : "pt-3"}`}>
        <SpeechBubble
          text={text}
          tail="left"
          tone={tone ?? (isDeepNight ? "night" : "light")}
        />
      </div>
    </div>
  );
}
