"use client";

// ─── Sub-components ────────────────────────────────────────────────────────
// TaskRow, TimerCore, PassLineField, ReviewSection, CreateModal, badges...

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureNotifyPermission,
  PRIORITY_META,
  pickSample,
  sendNotification,
  type Priority,
  type Review,
  type Task,
  type TaskSet,
} from "./lib";
import { Nem, NemWithBubble, resolveDialogue, DIALOGUE, type NemState } from "./nem";

// ─── ProgressBar ───────────────────────────────────────────────────────────

export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 night-subcard">
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// ─── Timer number display ──────────────────────────────────────────────────

export function TimerDigits({ seconds, big = false }: { seconds: number; big?: boolean }) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return (
    <span className={`font-mono font-bold tabular-nums ${big ? "text-6xl" : "text-2xl"}`}>
      {m}:{s}
    </span>
  );
}

// ─── Deadline badge ────────────────────────────────────────────────────────

export function DeadlineBadge({ deadline }: { deadline: string }) {
  if (!deadline) return null;
  const target = new Date(deadline);
  target.setHours(23, 59, 59);
  const diffMs = target.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let text = "";
  let cls = "";
  if (diffMs < 0) {
    text = "期限切れ";
    cls = "bg-red-100 text-red-600 ring-red-200";
  } else if (diffDays === 0) {
    text = "今日が期限！";
    cls = "bg-red-100 text-red-600 ring-red-200";
  } else if (diffDays === 1) {
    text = "明日が期限";
    cls = "bg-orange-100 text-orange-600 ring-orange-200";
  } else if (diffDays <= 3) {
    text = `あと${diffDays}日`;
    cls = "bg-amber-100 text-amber-600 ring-amber-200";
  } else {
    text = `あと${diffDays}日`;
    cls = "bg-slate-100 text-slate-600 ring-slate-200";
  }

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      📅 {text}
    </span>
  );
}

// ─── PassLineField ─────────────────────────────────────────────────────────

export function PassLineField({
  value,
  onChange,
  showHint = false,
}: {
  value: string;
  onChange: (v: string) => void;
  showHint?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(!value);

  useEffect(() => {
    setDraft(value);
    if (!value) setEditing(true);
  }, [value]);

  function commit() {
    onChange(draft.trim());
    setEditing(false);
  }

  return (
    <div
      className={`relative rounded-xl border p-3 transition ${
        showHint
          ? "border-indigo-300 bg-indigo-50/70 pulse-ring"
          : "border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-purple-50/40"
      } night-subcard night-border`}
    >
      <label className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-600 night-text-accent">
        <span>✨</span>
        <span>今日の合格ライン</span>
      </label>
      {editing ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          onBlur={commit}
          autoFocus
          placeholder="今日これができたら合格、を1行で"
          className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 night-input"
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium text-gray-700 night-text-body">
            {value || <span className="text-gray-300">未設定</span>}
          </p>
          <button
            onClick={() => setEditing(true)}
            className="flex-shrink-0 text-xs text-indigo-500 hover:text-indigo-700"
          >
            変更
          </button>
        </div>
      )}
      <p className="mt-1 text-[10px] leading-tight text-gray-400 night-text-muted">
        完成後に基準を吊り上げないための宣言。開始前に決めておく。
      </p>
    </div>
  );
}

// ─── TaskRow ───────────────────────────────────────────────────────────────

export function TaskRow({
  task,
  index,
  isTimerTarget,
  showTimerHint,
  onToggle,
  onUpdate,
  onDelete,
  onStartTimer,
}: {
  task: Task;
  index: number;
  isTimerTarget: boolean;
  showTimerHint?: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onStartTimer: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(task.label);
  const [draftMin, setDraftMin] = useState(String(task.minutes));
  const [showMemo, setShowMemo] = useState(false);
  const [draftMemo, setDraftMemo] = useState(task.memo);
  const labelRef = useRef<HTMLInputElement>(null);
  const pm = PRIORITY_META[task.priority];

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraftLabel(task.label);
    setDraftMin(String(task.minutes));
    setEditing(true);
    setTimeout(() => labelRef.current?.focus(), 0);
  }
  function commitEdit() {
    const mins = Math.max(1, Math.min(999, parseInt(draftMin) || task.minutes));
    onUpdate({ label: draftLabel.trim() || task.label, minutes: mins });
    setEditing(false);
  }
  function cyclePriority(e: React.MouseEvent) {
    e.stopPropagation();
    const order: Priority[] = ["high", "medium", "low"];
    const next = order[(order.indexOf(task.priority) + 1) % order.length];
    onUpdate({ priority: next });
  }
  function saveMemo() {
    onUpdate({ memo: draftMemo });
    setShowMemo(false);
  }

  return (
    <li
      className={`rounded-xl border transition-all duration-200 night-card night-border ${
        task.done
          ? "border-green-100 bg-green-50/60"
          : isTimerTarget
          ? "border-indigo-300 bg-indigo-50/60 shadow-sm"
          : "border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/20"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:gap-2.5 sm:px-4">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          aria-label="完了切り替え"
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            task.done
              ? "border-green-500 bg-green-500"
              : "border-gray-300 hover:border-indigo-400 active:scale-90"
          }`}
        >
          {task.done && (
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <span className="w-4 flex-shrink-0 text-center text-xs font-bold text-gray-300 night-text-muted">
          {index + 1}
        </span>

        <button
          onClick={cyclePriority}
          title="クリックで優先度を切り替え"
          className={`flex flex-shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold ring-1 ring-inset transition ${pm.bg} ${pm.color}`}
        >
          {pm.label}
          <svg className="h-2.5 w-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </button>

        {editing ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:flex-1 sm:flex-nowrap" onClick={(e) => e.stopPropagation()}>
            <input
              ref={labelRef}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
              className="min-w-0 flex-1 rounded-lg border border-indigo-300 px-2 py-1 text-sm outline-none ring-2 ring-indigo-100 night-input"
            />
            <input
              value={draftMin}
              onChange={(e) => setDraftMin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
              type="number" min={1} max={999}
              className="w-14 rounded-lg border border-indigo-300 px-2 py-1 text-center text-sm outline-none ring-2 ring-indigo-100 night-input"
            />
            <span className="text-xs text-gray-400 night-text-muted">分</span>
            <button onClick={commitEdit} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white">保存</button>
            <button onClick={() => setEditing(false)} className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-500">✕</button>
          </div>
        ) : (
          <>
            <span
              className={`min-w-0 flex-1 truncate text-sm font-medium leading-snug ${
                task.done ? "text-gray-400 line-through" : "text-gray-700 night-text-body"
              }`}
              onClick={(e) => { e.stopPropagation(); startEdit(e); }}
              title="クリックで編集"
            >
              {task.label}
            </span>
            <span className="flex-shrink-0 rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 night-subcard night-text-muted">
              {task.minutes}分
            </span>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {!task.done && (
                <button
                  onClick={onStartTimer}
                  title="集中モードでタイマー開始"
                  className={`relative rounded-md p-1.5 transition ${
                    isTimerTarget
                      ? "bg-indigo-100 text-indigo-600"
                      : showTimerHint
                      ? "text-indigo-500 pulse-ring bg-white"
                      : "text-gray-400 hover:bg-indigo-50 hover:text-indigo-500"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => { setDraftMemo(task.memo); setShowMemo((v) => !v); }}
                title="メモ"
                className={`rounded-md p-1.5 transition ${
                  task.memo ? "bg-amber-50 text-amber-500" : "text-gray-400 hover:bg-amber-50 hover:text-amber-500"
                }`}
              >
                <svg className="h-4 w-4" fill={task.memo ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={startEdit} title="編集" className="rounded-md p-1.5 text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6m-6 6l-3 4h4l5-5" />
                </svg>
              </button>
              <button onClick={onDelete} title="削除" className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {showMemo && !editing && (
        <div className="border-t border-dashed border-gray-100 px-4 pb-3 pt-2 night-border" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={draftMemo}
            onChange={(e) => setDraftMemo(e.target.value)}
            placeholder="メモを入力..."
            rows={2}
            className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-gray-600 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 night-input"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button onClick={() => setShowMemo(false)} className="text-xs text-gray-400 hover:text-gray-600 night-text-muted">
              キャンセル
            </button>
            <button onClick={saveMemo} className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-white hover:bg-amber-500">
              保存
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── TimerCore (Focus タブ本体) ────────────────────────────────────────────

export function TimerCore({
  task,
  isDeepNightMode,
  isPastMidnightMode,
  onDone,
  onSkip,
  onBackToHome,
}: {
  task: Task;
  isDeepNightMode: boolean;
  isPastMidnightMode: boolean;
  onDone: () => void;
  onSkip: () => void;
  onBackToHome: () => void;
}) {
  const totalSec = task.minutes * 60;
  const [seconds, setSeconds] = useState(totalSec);
  const [overtime, setOvertime] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"countdown" | "overtime">("countdown");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const notifiedRef = useRef(false);
  const notified15Ref = useRef(false);
  const notified30Ref = useRef(false);

  // reset when task changes
  useEffect(() => {
    clearInterval(intervalRef.current!);
    elapsedRef.current = 0;
    notifiedRef.current = false;
    notified15Ref.current = false;
    notified30Ref.current = false;
    setSeconds(totalSec);
    setOvertime(0);
    setPhase("countdown");
    setRunning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const startInterval = useCallback(() => {
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      const elapsed = elapsedRef.current;
      if (elapsed <= totalSec) {
        setSeconds(totalSec - elapsed);
        if (elapsed === totalSec) {
          setPhase("overtime");
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            sendNotification("⏰ 時間です", `「${task.label}」の予定時間が終わりました`);
          }
        }
      } else {
        const over = elapsed - totalSec;
        setOvertime(over);
        if (over === 15 * 60 && !notified15Ref.current) {
          notified15Ref.current = true;
          sendNotification("⚠️ +15分オーバー", "肩の力、抜いてみて");
        }
        if (over === 30 * 60 && !notified30Ref.current) {
          notified30Ref.current = true;
          sendNotification("😴 +30分オーバー", "もう寝よ？");
        }
      }
    }, 1000);
  }, [totalSec, task.label]);

  async function toggle() {
    if (running) {
      clearInterval(intervalRef.current!);
      setRunning(false);
    } else {
      await ensureNotifyPermission();
      startInterval();
      setRunning(true);
    }
  }

  function reset() {
    clearInterval(intervalRef.current!);
    elapsedRef.current = 0;
    notifiedRef.current = false;
    notified15Ref.current = false;
    notified30Ref.current = false;
    setRunning(false);
    setPhase("countdown");
    setSeconds(totalSec);
    setOvertime(0);
  }

  function extendTime(extraMin: number) {
    clearInterval(intervalRef.current!);
    const extraSec = extraMin * 60;
    elapsedRef.current = Math.max(0, totalSec - extraSec);
    notifiedRef.current = false;
    notified15Ref.current = false;
    notified30Ref.current = false;
    setPhase("countdown");
    setOvertime(0);
    setSeconds(extraSec);
    if (running) startInterval();
  }

  useEffect(() => () => clearInterval(intervalRef.current!), []);

  const isOver = phase === "overtime";
  const overMin = Math.floor(overtime / 60);
  const nemState: NemState = !running && !isOver
    ? "timer-idle"
    : isOver && overMin >= 30
    ? "overtime-30"
    : isOver && overMin >= 15
    ? "overtime-15"
    : isOver
    ? "overtime-just"
    : "timer-running";
  const dialogueLine = resolveDialogue(nemState, isDeepNightMode, isPastMidnightMode);

  const pct = phase === "overtime" ? 1 : 1 - seconds / totalSec;
  const r = 78;
  const circ = 2 * Math.PI * r;

  return (
    <div className={`rounded-3xl p-6 shadow-sm transition-colors night-card ${
      isOver ? "bg-red-50 ring-2 ring-red-200 night-warn-strong" : "bg-white ring-1 ring-indigo-100"
    }`}>
      <div className="mb-2 flex items-center justify-between">
        <button onClick={onBackToHome} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 night-text-muted">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          今日に戻る
        </button>
        <span className={`text-xs font-semibold uppercase tracking-wider ${isOver ? "text-red-500" : "text-indigo-500 night-text-accent"}`}>
          {isOver ? "⚠️ 超過中" : running ? "集中中" : "スタンバイ"}
        </span>
      </div>

      {/* Task name (big) */}
      <p className="mb-4 truncate text-center text-lg font-bold text-gray-800 night-text-body">
        {task.label}
      </p>

      {/* Circle timer */}
      <div className="mb-4 flex justify-center">
        <div className="relative h-52 w-52">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 180 180">
            <circle
              cx="90" cy="90" r={r}
              fill="none"
              stroke={isOver ? "#fee2e2" : "#e5e7eb"}
              strokeWidth="10"
            />
            <circle
              cx="90" cy="90" r={r}
              fill="none"
              stroke={isOver ? "#ef4444" : "#6366f1"}
              strokeWidth="10"
              strokeDasharray={circ}
              strokeDashoffset={isOver ? 0 : circ * (1 - pct)}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            {isOver ? (
              <>
                <span className="text-xs font-bold text-red-400">超過</span>
                <span className="font-mono text-4xl font-bold tabular-nums text-red-500">
                  +<TimerDigits seconds={overtime} />
                </span>
              </>
            ) : (
              <TimerDigits seconds={seconds} big />
            )}
          </div>
        </div>
      </div>

      {/* Nem talking */}
      <div className="mb-4">
        <NemWithBubble
          expression={dialogueLine.expression}
          text={dialogueLine.line}
          size={64}
          tone={isDeepNightMode ? "night" : "light"}
        />
      </div>

      {/* Overtime extend row */}
      {isOver && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[5, 10, 15].map((m) => (
            <button
              key={m}
              onClick={() => extendTime(m)}
              className="rounded-xl border-2 border-red-200 bg-white py-2.5 text-sm font-bold text-red-500 transition hover:bg-red-50 active:scale-95 night-card"
            >
              +{m}分
            </button>
          ))}
        </div>
      )}

      {/* Main controls */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <button
          onClick={toggle}
          className={`col-span-2 rounded-2xl py-3.5 text-sm font-bold text-white transition active:scale-95 ${
            running
              ? isOver ? "bg-red-400 hover:bg-red-500" : "bg-amber-500 hover:bg-amber-600"
              : isOver ? "bg-red-500 hover:bg-red-600 glow-pulse" : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          }`}
        >
          {running ? "⏸ 一時停止" : "▶ 開始"}
        </button>
        <button
          onClick={onDone}
          className="rounded-2xl bg-green-500 py-3.5 text-sm font-bold text-white transition hover:bg-green-600 active:scale-95"
          title="タスクを完了にする"
        >
          ✓ 完了
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex-1 rounded-xl bg-gray-100 py-2 text-xs text-gray-500 hover:bg-gray-200 night-subcard"
        >
          リセット
        </button>
        <button
          onClick={onSkip}
          className="flex-1 rounded-xl bg-gray-100 py-2 text-xs text-gray-500 hover:bg-gray-200 night-subcard"
        >
          スキップ
        </button>
      </div>
    </div>
  );
}

// ─── ReviewSection ─────────────────────────────────────────────────────────

export function ReviewSection({
  taskSet,
  isDeepNightMode,
  isPastMidnightMode,
  onSave,
  onReset,
}: {
  taskSet: TaskSet;
  isDeepNightMode: boolean;
  isPastMidnightMode: boolean;
  onSave: (review: Review) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [achieved, setAchieved] = useState<boolean | null>(null);
  const [memo, setMemo] = useState("");

  const done = taskSet.tasks.filter((t) => t.done).length;
  const total = taskSet.tasks.length;
  const totalMin = taskSet.tasks.reduce((s, t) => s + t.minutes, 0);
  const doneMin = taskSet.tasks.filter((t) => t.done).reduce((s, t) => s + t.minutes, 0);
  const hasPassLine = !!(taskSet.passLine && taskSet.passLine.trim());

  function submit() {
    if (achieved === null) return;
    onSave({ at: Date.now(), achieved, memo: memo.trim() });
    setOpen(false);
    setAchieved(null);
    setMemo("");
  }

  // Already reviewed
  if (taskSet.review) {
    const r = taskSet.review;
    const nemState: NemState = r.achieved ? "review-yes" : "review-no";
    const line = resolveDialogue(nemState, isDeepNightMode, isPastMidnightMode);
    return (
      <div className={`rounded-xl border p-4 night-card night-border ${
        r.achieved ? "border-green-200 bg-green-50/60" : "border-amber-200 bg-amber-50/60"
      }`}>
        <div className="mb-3">
          <NemWithBubble
            expression={line.expression}
            text={line.line}
            size={56}
            tone={isDeepNightMode ? "night" : "light"}
          />
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 night-text-muted">
              📖 今日の振り返り
            </p>
            <p className={`mt-1 text-lg font-bold ${r.achieved ? "text-green-600" : "text-amber-600"}`}>
              {r.achieved ? "👍 合格ライン達成" : "❌ 未達成"}
            </p>
            {hasPassLine && (
              <p className="mt-1 text-xs text-gray-500 night-text-muted">
                合格ライン: <span className="text-gray-700 night-text-body">{taskSet.passLine}</span>
              </p>
            )}
            {r.memo && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 night-text-body">{r.memo}</p>
            )}
            <p className="mt-2 text-[11px] text-gray-400 night-text-muted">
              {new Date(r.at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              ・完了 {done}/{total} タスク・{doneMin}/{totalMin}分
            </p>
          </div>
          <button
            onClick={onReset}
            className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 night-text-muted"
            title="振り返りを取り消す"
          >
            やり直す
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 py-4 text-sm font-bold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50 night-card"
      >
        📖 今日を振り返る
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-4 night-card night-border">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-600 night-text-accent">
        📖 今日の振り返り
      </p>

      {hasPassLine ? (
        <div className="mb-4 rounded-lg bg-indigo-50 px-3 py-2 night-subcard">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 night-text-accent">開始前の宣言</p>
          <p className="mt-0.5 text-sm font-medium text-gray-700 night-text-body">{taskSet.passLine}</p>
        </div>
      ) : (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
          合格ラインが未設定です。感覚で答えて構いません。
        </p>
      )}

      <p className="mb-2 text-sm font-medium text-gray-700 night-text-body">達成できた？</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setAchieved(true)}
          className={`rounded-xl py-3.5 text-sm font-bold transition active:scale-95 ${
            achieved === true ? "bg-green-500 text-white" : "bg-green-50 text-green-600 hover:bg-green-100"
          }`}
        >
          👍 できた
        </button>
        <button
          onClick={() => setAchieved(false)}
          className={`rounded-xl py-3.5 text-sm font-bold transition active:scale-95 ${
            achieved === false ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600 hover:bg-amber-100"
          }`}
        >
          ❌ 未達成
        </button>
      </div>

      <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 night-subcard">
        今日の記録: 完了 <span className="font-bold text-gray-700 night-text-body">{done}/{total}</span> タスク
        ・作業時間 <span className="font-bold text-gray-700 night-text-body">{doneMin}/{totalMin}分</span>
      </div>

      <label className="mb-1 block text-xs text-gray-500 night-text-muted">一言メモ（任意）</label>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={2}
        placeholder="次に活かすメモ..."
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 night-input"
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm text-gray-600 hover:bg-gray-200 night-subcard"
        >
          キャンセル
        </button>
        <button
          onClick={submit}
          disabled={achieved === null}
          className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm font-bold text-white transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ─── CreateModal (Bottom sheet) ────────────────────────────────────────────

export function CreateModal({
  open,
  apiKey,
  isDeepNightMode,
  isPastMidnightMode,
  onClose,
  onCreate,
  onOpenApiSettings,
}: {
  open: boolean;
  apiKey: string;
  isDeepNightMode: boolean;
  isPastMidnightMode: boolean;
  onClose: () => void;
  onCreate: (topic: string, tasks: { label: string; minutes: number }[], deadline: string, passLine: string) => void;
  onOpenApiSettings: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState("");
  const [deadline, setDeadline] = useState("");
  const [passLine, setPassLine] = useState("");
  const [tasks, setTasks] = useState<{ label: string; minutes: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setTopic("");
      setDeadline("");
      setPassLine("");
      setTasks([]);
      setError("");
      setLoading(false);
    }
  }, [open]);

  async function breakDown() {
    if (!topic.trim()) return;
    if (!apiKey.trim()) {
      setError("APIキー未設定。「サンプルで試す」を使うか、下の『APIキーを設定』へ。");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTasks(data.tasks);
      setStep(3);
    } catch (e: unknown) {
      setError((e as Error).message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function loadSample() {
    const picked = pickSample(topic);
    if (!topic.trim()) setTopic(picked.key);
    setTasks(picked.tasks);
    setStep(3);
  }

  function confirmCreate() {
    onCreate(topic.trim() || "無題の課題", tasks, deadline, passLine.trim());
  }

  function editTaskLabel(i: number, label: string) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, label } : t)));
  }
  function editTaskMinutes(i: number, mins: number) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, minutes: Math.max(1, mins) } : t)));
  }
  function removeTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addTaskLine() {
    setTasks((prev) => [...prev, { label: "新しいタスク", minutes: 15 }]);
  }

  const nemState: NemState = loading ? "ai-thinking" : step === 1 ? (topic ? "typing" : "empty") : step === 3 ? "after-breakdown" : "empty";
  const nemLine = resolveDialogue(nemState, isDeepNightMode, isPastMidnightMode);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 fade-in" onClick={onClose} />
      {/* sheet */}
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl slide-up-modal night-card">
        {/* drag handle */}
        <div className="flex justify-center py-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-2 sm:pt-5">
          <p className="text-sm font-bold text-gray-500 night-text-muted">
            新しい課題 ({step}/3)
          </p>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {/* Nem greeting */}
          <div className="mb-4">
            <NemWithBubble
              expression={nemLine.expression}
              text={nemLine.line}
              size={64}
              tone={isDeepNightMode ? "night" : "light"}
            />
          </div>

          {/* Step 1: input */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700 night-text-body">
                  やること
                </label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例: 期末レポート、プレゼン準備..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 night-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700 night-text-body">
                  締め切り（任意）
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 night-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700 night-text-body">
                  合格ライン（任意・後で入れてもOK）
                </label>
                <input
                  value={passLine}
                  onChange={(e) => setPassLine(e.target.value)}
                  placeholder="今日これができたら合格、を1行で"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 night-input"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={() => setStep(2)}
                disabled={!topic.trim()}
                className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                次へ →
              </button>
            </div>
          )}

          {/* Step 2: break down */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-xl bg-indigo-50/50 px-4 py-3 night-subcard">
                <p className="text-xs text-gray-500 night-text-muted">やること</p>
                <p className="text-sm font-bold text-gray-800 night-text-body">{topic}</p>
              </div>
              <button
                onClick={breakDown}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 py-4 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    ネムが刻んでるよ...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AIで分解する
                  </>
                )}
              </button>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-100 night-border" />
                <span className="text-xs text-gray-400 night-text-muted">または</span>
                <div className="h-px flex-1 bg-gray-100 night-border" />
              </div>
              <button
                onClick={loadSample}
                disabled={loading}
                className="w-full rounded-2xl border-2 border-indigo-200 bg-white py-3.5 text-sm font-bold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 night-card"
              >
                🎁 サンプルで試す (APIキー不要)
              </button>
              {!apiKey && (
                <button
                  onClick={onOpenApiSettings}
                  className="w-full rounded-xl bg-gray-50 py-2 text-xs text-gray-500 hover:bg-gray-100 night-subcard"
                >
                  APIキーを設定する →
                </button>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button onClick={() => setStep(1)} className="w-full text-xs text-gray-400 hover:text-gray-600 night-text-muted">
                ← 戻る
              </button>
            </div>
          )}

          {/* Step 3: preview */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 night-text-muted">分解された {tasks.length} タスク（編集OK）</p>
              <ul className="space-y-2">
                {tasks.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2 night-subcard night-border">
                    <span className="w-4 flex-shrink-0 text-center text-xs font-bold text-gray-400 night-text-muted">{i + 1}</span>
                    <input
                      value={t.label}
                      onChange={(e) => editTaskLabel(i, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-100 night-input"
                    />
                    <input
                      type="number"
                      value={t.minutes}
                      onChange={(e) => editTaskMinutes(i, parseInt(e.target.value) || 1)}
                      min={1}
                      max={999}
                      className="w-14 rounded-lg bg-white px-2 py-1 text-center text-sm outline-none focus:ring-2 focus:ring-indigo-100 night-input"
                    />
                    <span className="text-xs text-gray-400 night-text-muted">分</span>
                    <button onClick={() => removeTask(i)} className="text-gray-300 hover:text-red-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={addTaskLine}
                className="w-full rounded-xl border border-dashed border-gray-200 py-2 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 night-border"
              >
                + タスクを追加
              </button>
              <button
                onClick={confirmCreate}
                disabled={tasks.length === 0}
                className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ✓ 今日のセットにする
              </button>
              <button onClick={() => setStep(2)} className="w-full text-xs text-gray-400 hover:text-gray-600 night-text-muted">
                ← 分解し直す
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SmallNem: 常駐用 ──────────────────────────────────────────────────────

export function SmallNemHeader({
  state,
  isDeepNightMode,
  isPastMidnightMode,
}: {
  state: NemState;
  isDeepNightMode: boolean;
  isPastMidnightMode: boolean;
}) {
  const line = resolveDialogue(state, isDeepNightMode, isPastMidnightMode);
  return (
    <div className="mb-4 flex items-start gap-2.5 soft-appear">
      <Nem expression={line.expression} size={56} />
      <div className="mt-2 min-w-0 flex-1">
        <div
          className="relative inline-block max-w-full rounded-2xl bg-white px-3.5 py-2 shadow-sm ring-1 ring-gray-100 night-card night-border"
          style={{ animation: "bubbleFadeIn 0.4s ease-out both" }}
        >
          <p className="text-sm text-gray-700 night-text-body">{line.line}</p>
          <div
            className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 bg-white ring-1 ring-gray-100 night-card night-border"
          />
        </div>
      </div>
    </div>
  );
}

// silence unused imports for typechecker
export { DIALOGUE };
