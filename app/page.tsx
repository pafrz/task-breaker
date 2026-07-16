"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";

type Task = {
  id: number;
  label: string;
  minutes: number;
  done: boolean;
  priority: Priority;
  memo: string;
};

type Review = {
  at: number;              // timestamp
  achieved: boolean;       // 合格ラインを達成できたか
  memo: string;            // 一言メモ
};

type TaskSet = {
  id: string;
  topic: string;
  tasks: Task[];
  deadline: string;        // ISO date or ""
  createdAt: number;
  passLine?: string;       // v4: 今日これができたら合格
  review?: Review;         // v4: 今日の振り返り結果
};

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "task-breaker-v2";
const API_KEY_STORAGE = "task-breaker-api-key";

function loadStorage(): { taskSets: TaskSet[]; currentId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { taskSets: [], currentId: null };
    return JSON.parse(raw);
  } catch {
    return { taskSets: [], currentId: null };
  }
}

function saveStorage(taskSets: TaskSet[], currentId: string | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ taskSets, currentId }));
}

function genId() {
  return Math.random().toString(36).slice(2);
}

// ─── Sample Data (Demo Mode) ─────────────────────────────────────────────────

const SAMPLE_DATA: Record<string, { label: string; minutes: number }[]> = {
  "期末レポート": [
    { label: "テーマを絞り込む", minutes: 15 },
    { label: "参考文献をピックアップ", minutes: 30 },
    { label: "アウトラインを書く", minutes: 20 },
    { label: "本文を書く", minutes: 60 },
    { label: "推敲して提出", minutes: 20 },
  ],
  "プレゼン準備": [
    { label: "伝えたい要点を3つ決める", minutes: 15 },
    { label: "スライド構成を書き出す", minutes: 20 },
    { label: "スライドを作成する", minutes: 60 },
    { label: "話す練習をする", minutes: 20 },
    { label: "本番前リハーサル", minutes: 15 },
  ],
  "コードレビュー": [
    { label: "変更差分をざっと読む", minutes: 10 },
    { label: "気になる箇所をリスト化", minutes: 15 },
    { label: "詳細に検証する", minutes: 30 },
    { label: "コメントを書く", minutes: 15 },
    { label: "作者と議論", minutes: 20 },
  ],
  "読書レポート": [
    { label: "テーマ・構成を決める", minutes: 15 },
    { label: "関連箇所を再読する", minutes: 30 },
    { label: "序論を書く", minutes: 20 },
    { label: "本論を書く", minutes: 40 },
    { label: "結論・校正", minutes: 20 },
  ],
};

const SAMPLE_KEYS = Object.keys(SAMPLE_DATA);
const DEFAULT_SAMPLE_KEY = "期末レポート";

function pickSample(topic: string): { key: string; tasks: { label: string; minutes: number }[] } {
  const t = topic.trim();
  if (!t) {
    const key = SAMPLE_KEYS[Math.floor(Math.random() * SAMPLE_KEYS.length)];
    return { key, tasks: SAMPLE_DATA[key] };
  }
  const hit = SAMPLE_KEYS.find((k) => t.includes(k) || k.includes(t));
  const key = hit ?? DEFAULT_SAMPLE_KEY;
  return { key, tasks: SAMPLE_DATA[key] };
}

// ─── Notification (音 + ブラウザ通知) ─────────────────────────────────────────

function playBeep(freq: number, duration: number, delayMs = 0) {
  setTimeout(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration / 1000);
    } catch {
      /* audio not available */
    }
  }, delayMs);
}

/** 「時間ですよ」のアラーム音（ビープ3連） */
function playAlarm() {
  playBeep(880, 200, 0);
  playBeep(880, 200, 300);
  playBeep(1100, 400, 600);
}

function sendNotification(title: string, body: string) {
  playAlarm();
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico", tag: "task-breaker" });
    } catch {
      /* ignore */
    }
  }
}

async function ensureNotifyPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}

// ─── Priority Meta ───────────────────────────────────────────────────────────

const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; bg: string; dot: string }
> = {
  high:   { label: "高", color: "text-red-600",   bg: "bg-red-50",    dot: "bg-red-400" },
  medium: { label: "中", color: "text-amber-600", bg: "bg-amber-50",  dot: "bg-amber-400" },
  low:    { label: "低", color: "text-slate-500", bg: "bg-slate-50",  dot: "bg-slate-300" },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function TimerDisplay({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return <span className="font-mono text-2xl font-bold tabular-nums">{m}:{s}</span>;
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  if (!deadline) return null;
  const target = new Date(deadline);
  target.setHours(23, 59, 59);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
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

function TaskRow({
  task, index, isTimerTarget, onToggle, onUpdate, onDelete, onStartTimer,
}: {
  task: Task;
  index: number;
  isTimerTarget: boolean;
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
    <li className={`rounded-xl border transition-all duration-200 ${
      task.done ? "border-green-100 bg-green-50/60" :
      isTimerTarget ? "border-indigo-300 bg-indigo-50/60 shadow-sm" :
      "border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/20"
    }`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:gap-2.5 sm:px-4">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          aria-label="完了切り替え"
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            task.done ? "border-green-500 bg-green-500" : "border-gray-300 hover:border-indigo-400"
          }`}
        >
          {task.done && (
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Step # */}
        <span className="w-4 flex-shrink-0 text-center text-xs font-bold text-gray-300">{index + 1}</span>

        {/* Priority badge — with hint icon */}
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

        {/* Label / editor */}
        {editing ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:flex-1 sm:flex-nowrap" onClick={(e) => e.stopPropagation()}>
            <input
              ref={labelRef}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
              className="min-w-0 flex-1 rounded-lg border border-indigo-300 px-2 py-1 text-sm outline-none ring-2 ring-indigo-100"
            />
            <input
              value={draftMin}
              onChange={(e) => setDraftMin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
              type="number" min={1} max={999}
              className="w-14 rounded-lg border border-indigo-300 px-2 py-1 text-center text-sm outline-none ring-2 ring-indigo-100"
            />
            <span className="text-xs text-gray-400">分</span>
            <button onClick={commitEdit} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white">保存</button>
            <button onClick={() => setEditing(false)} className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-500">✕</button>
          </div>
        ) : (
          <>
            <span
              className={`min-w-0 flex-1 truncate text-sm font-medium leading-snug ${task.done ? "text-gray-400 line-through" : "text-gray-700"}`}
              onClick={(e) => { e.stopPropagation(); startEdit(e); }}
              title="クリックで編集"
            >
              {task.label}
            </span>
            {/* Time */}
            <span className="flex-shrink-0 rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200">
              {task.minutes}分
            </span>
            {/* Actions — always visible for mobile */}
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {!task.done && (
                <button onClick={onStartTimer} title="タイマー開始"
                  className={`rounded-md p-1.5 transition ${
                    isTimerTarget ? "bg-indigo-100 text-indigo-600" : "text-gray-400 hover:bg-indigo-50 hover:text-indigo-500"
                  }`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              <button onClick={() => { setDraftMemo(task.memo); setShowMemo((v) => !v); }} title="メモ"
                className={`rounded-md p-1.5 transition ${task.memo ? "bg-amber-50 text-amber-500" : "text-gray-400 hover:bg-amber-50 hover:text-amber-500"}`}>
                <svg className="h-4 w-4" fill={task.memo ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={startEdit} title="編集"
                className="rounded-md p-1.5 text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6m-6 6l-3 4h4l5-5" />
                </svg>
              </button>
              <button onClick={onDelete} title="削除"
                className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Memo editor */}
      {showMemo && !editing && (
        <div className="border-t border-dashed border-gray-100 px-4 pb-3 pt-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={draftMemo}
            onChange={(e) => setDraftMemo(e.target.value)}
            placeholder="メモを入力..."
            rows={2}
            className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-gray-600 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button onClick={() => setShowMemo(false)} className="text-xs text-gray-400 hover:text-gray-600">キャンセル</button>
            <button onClick={saveMemo} className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-white hover:bg-amber-500">保存</button>
          </div>
        </div>
      )}
    </li>
  );
}

/** タイマーパネル（超過対応 + 音・通知） */
function TimerPanel({
  task, onDone, onClose,
}: {
  task: Task;
  onDone: () => void;
  onClose: () => void;
}) {
  const totalSec = task.minutes * 60;
  const [seconds, setSeconds] = useState(totalSec);
  const [overtime, setOvertime] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"countdown" | "overtime">("countdown");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const notifiedRef = useRef(false);

  function startInterval() {
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
        setOvertime(elapsed - totalSec);
      }
    }, 1000);
  }

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
    setPhase("countdown");
    setOvertime(0);
    setSeconds(extraSec);
    if (running) startInterval();
  }

  useEffect(() => () => clearInterval(intervalRef.current!), []);

  const pct = phase === "overtime" ? 1 : 1 - seconds / totalSec;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const isOver = phase === "overtime";

  return (
    <div className={`rounded-2xl p-5 shadow-sm transition-colors ${
      isOver ? "bg-red-50 ring-1 ring-red-200" : "bg-white ring-1 ring-indigo-100"
    }`}>
      <div className="mb-3 flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wide ${isOver ? "text-red-500" : "text-indigo-600"}`}>
          {isOver ? "⚠️ 時間超過中" : "タイマー"}
        </p>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="mb-4 truncate text-sm font-medium text-gray-700">{task.label}</p>

      <div className="mb-4 flex justify-center">
        <div className="relative h-32 w-32">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={r} fill="none" stroke={isOver ? "#fee2e2" : "#e5e7eb"} strokeWidth="8" />
            <circle
              cx="60" cy="60" r={r} fill="none"
              stroke={isOver ? "#ef4444" : "#6366f1"}
              strokeWidth="8"
              strokeDasharray={circ}
              strokeDashoffset={isOver ? 0 : circ * (1 - pct)}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            {isOver ? (
              <>
                <span className="text-xs font-bold text-red-400">超過</span>
                <span className="font-mono text-xl font-bold tabular-nums text-red-500">
                  +<TimerDisplay seconds={overtime} />
                </span>
              </>
            ) : (
              <TimerDisplay seconds={seconds} />
            )}
          </div>
        </div>
      </div>

      {isOver && (
        <>
          <p className="mb-2 text-center text-xs text-red-500">
            もう少しやりますか？やめますか？
          </p>
          <div className="mb-3 flex gap-2">
            {[5, 10, 15].map((m) => (
              <button key={m} onClick={() => extendTime(m)}
                className="flex-1 rounded-xl border border-red-200 bg-white py-2 text-sm font-bold text-red-500 transition hover:bg-red-50">
                +{m}分
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={toggle}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition ${
            running
              ? isOver ? "bg-red-400 hover:bg-red-500" : "bg-amber-500 hover:bg-amber-600"
              : isOver ? "bg-red-500 hover:bg-red-600" : "bg-indigo-600 hover:bg-indigo-700"
          }`}>
          {running ? "⏸ 一時停止" : "▶ 再開"}
        </button>
        <button onClick={onDone}
          className="rounded-xl bg-green-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-green-600"
          title="このタスクを完了にする">
          ✓
        </button>
        <button onClick={reset}
          className="rounded-xl bg-gray-100 px-3 py-2.5 text-gray-500 hover:bg-gray-200">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** 合格ライン入力（作業開始前の宣言） */
function PassLineField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
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
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 p-3">
      <label className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-indigo-600">
        <span>✨</span>
        <span>今日の合格ライン</span>
      </label>
      {editing ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
            onBlur={commit}
            autoFocus
            placeholder="今日これができたら合格、を1行で"
            className="flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="flex-1 text-sm font-medium text-gray-700">
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
      <p className="mt-1 text-[10px] leading-tight text-gray-400">
        完成後に基準を吊り上げないため、開始前に決めておく
      </p>
    </div>
  );
}

/** 今日の振り返り（作業終了後の照合） */
function ReviewSection({
  taskSet,
  onSave,
  onReset,
}: {
  taskSet: TaskSet;
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

  // Already reviewed → show result
  if (taskSet.review) {
    const r = taskSet.review;
    return (
      <div className={`mt-4 rounded-xl border p-4 ${
        r.achieved ? "border-green-200 bg-green-50/60" : "border-amber-200 bg-amber-50/60"
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              📖 今日の振り返り
            </p>
            <p className={`mt-1 text-lg font-bold ${r.achieved ? "text-green-600" : "text-amber-600"}`}>
              {r.achieved ? "👍 合格ライン達成" : "❌ 未達成"}
            </p>
            {hasPassLine && (
              <p className="mt-1 text-xs text-gray-500">
                合格ライン: <span className="text-gray-700">{taskSet.passLine}</span>
              </p>
            )}
            {r.memo && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{r.memo}</p>
            )}
            <p className="mt-2 text-[11px] text-gray-400">
              {new Date(r.at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              ・完了 {done}/{total} タスク・{doneMin}/{totalMin}分
            </p>
          </div>
          <button
            onClick={onReset}
            className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600"
            title="振り返りを取り消す"
          >
            やり直す
          </button>
        </div>
      </div>
    );
  }

  // Not yet reviewed
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 py-3 text-sm font-bold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
      >
        📖 今日を振り返る
      </button>
    );
  }

  // Review form
  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-600">
        📖 今日の振り返り
      </p>

      {hasPassLine ? (
        <div className="mb-4 rounded-lg bg-indigo-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">開始前の宣言</p>
          <p className="mt-0.5 text-sm font-medium text-gray-700">{taskSet.passLine}</p>
        </div>
      ) : (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
          合格ラインが未設定です。感覚で答えて構いません。
        </p>
      )}

      <p className="mb-2 text-sm font-medium text-gray-700">達成できた？</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setAchieved(true)}
          className={`rounded-xl py-3 text-sm font-bold transition ${
            achieved === true ? "bg-green-500 text-white" : "bg-green-50 text-green-600 hover:bg-green-100"
          }`}
        >
          👍 できた
        </button>
        <button
          onClick={() => setAchieved(false)}
          className={`rounded-xl py-3 text-sm font-bold transition ${
            achieved === false ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600 hover:bg-amber-100"
          }`}
        >
          ❌ 未達成
        </button>
      </div>

      <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
        今日の記録: 完了 <span className="font-bold text-gray-700">{done}/{total}</span> タスク
        ・作業時間 <span className="font-bold text-gray-700">{doneMin}/{totalMin}分</span>
      </div>

      <label className="mb-1 block text-xs text-gray-500">一言メモ（任意）</label>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={2}
        placeholder="次に活かすメモ..."
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm text-gray-600 hover:bg-gray-200"
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [input, setInput] = useState("");
  const [taskSets, setTaskSets] = useState<TaskSet[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [timerTaskId, setTimerTaskId] = useState<number | null>(null);

  useEffect(() => {
    const stored = loadStorage();
    setTaskSets(stored.taskSets);
    setCurrentId(stored.currentId);
    const key = localStorage.getItem(API_KEY_STORAGE) ?? "";
    setApiKey(key);
    // 初回でキーが無い時だけキー欄を初期展開
    setShowKeyPanel(!!key);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    saveStorage(taskSets, currentId);
  }, [taskSets, currentId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey, mounted]);

  const current = taskSets.find((s) => s.id === currentId) ?? null;
  const total = current?.tasks.reduce((s, t) => s + t.minutes, 0) ?? 0;
  const remaining = current?.tasks.filter((t) => !t.done).reduce((s, t) => s + t.minutes, 0) ?? 0;
  const doneCount = current?.tasks.filter((t) => t.done).length ?? 0;
  const progress = current && current.tasks.length > 0
    ? Math.round((doneCount / current.tasks.length) * 100)
    : 0;
  const timerTask = current?.tasks.find((t) => t.id === timerTaskId) ?? null;

  const sortedTasks = current
    ? [...current.tasks].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const order: Priority[] = ["high", "medium", "low"];
        return order.indexOf(a.priority) - order.indexOf(b.priority);
      })
    : [];

  // ── Actions ─────────────────────────────────────────────────────────────

  const createSet = useCallback(
    (topic: string, taskData: { label: string; minutes: number }[]) => {
      const newSet: TaskSet = {
        id: genId(),
        topic,
        tasks: taskData.map((t, i) => ({
          id: i + 1,
          label: t.label,
          minutes: t.minutes,
          done: false,
          priority: "medium" as Priority,
          memo: "",
        })),
        deadline: "",
        createdAt: Date.now(),
        passLine: "",
      };
      setTaskSets((prev) => [newSet, ...prev.slice(0, 19)]);
      setCurrentId(newSet.id);
      setInput("");
      setTimerTaskId(null);
    },
    []
  );

  async function handleBreak() {
    if (!input.trim()) return;
    if (!apiKey.trim()) {
      setError("APIキーを入力するか、下の「サンプルで試す」ボタンを使ってください");
      setShowKeyPanel(true);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: input.trim(), apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      createSet(input.trim(), data.tasks);
    } catch (e: unknown) {
      setError((e as Error).message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function handleDemo() {
    setError("");
    const picked = pickSample(input);
    const topic = input.trim() || picked.key;
    createSet(topic, picked.tasks);
  }

  function updateCurrent(fn: (s: TaskSet) => TaskSet) {
    setTaskSets((prev) => prev.map((s) => (s.id === currentId ? fn(s) : s)));
  }

  function toggleTask(taskId: number) {
    updateCurrent((s) => ({
      ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
    }));
  }

  function updateTask(taskId: number, patch: Partial<Task>) {
    updateCurrent((s) => ({
      ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    }));
  }

  function deleteTask(taskId: number) {
    if (timerTaskId === taskId) setTimerTaskId(null);
    updateCurrent((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }));
  }

  function addTask() {
    if (!current) return;
    const maxId = current.tasks.reduce((m, t) => Math.max(m, t.id), 0);
    updateCurrent((s) => ({
      ...s,
      tasks: [
        ...s.tasks,
        { id: maxId + 1, label: "新しいタスク", minutes: 15, done: false, priority: "medium", memo: "" },
      ],
    }));
  }

  function setDeadline(val: string) {
    updateCurrent((s) => ({ ...s, deadline: val }));
  }

  function setPassLine(val: string) {
    updateCurrent((s) => ({ ...s, passLine: val }));
  }

  function saveReview(review: Review) {
    updateCurrent((s) => ({ ...s, review }));
  }

  function resetReview() {
    updateCurrent((s) => ({ ...s, review: undefined }));
  }

  function resetProgress() {
    updateCurrent((s) => ({
      ...s,
      tasks: s.tasks.map((t) => ({ ...t, done: false })),
      review: undefined,
    }));
  }

  function deleteSet(id: string) {
    setTaskSets((prev) => prev.filter((s) => s.id !== id));
    if (currentId === id) {
      setCurrentId(null);
      setTimerTaskId(null);
    }
  }

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-lg space-y-5">
        {/* ── Header ── */}
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            Task Breaker
          </h1>
          <p className="mt-1 text-sm text-gray-500">徹夜を防ぐ、AIタスク管理</p>
        </div>

        {/* ── API Key (畳める) ── */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <button
            onClick={() => setShowKeyPanel((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              OpenAI API キー {apiKey && <span className="text-green-500">✓ 設定済</span>}
            </span>
            <svg className={`h-4 w-4 transition-transform ${showKeyPanel ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showKeyPanel && (
            <div className="mt-3">
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <button onClick={() => setShowKey((v) => !v)}
                  className="rounded-xl border border-gray-200 px-3 text-gray-400 hover:bg-gray-50">
                  {showKey
                    ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
                  className="text-indigo-500 hover:text-indigo-700 underline">
                  platform.openai.com/api-keys
                </a>
                {" "}で取得。ブラウザのみに保存され外部送信されません。
              </p>
            </div>
          )}
        </div>

        {/* ── Input ── */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            課題・作業内容
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBreak()}
            placeholder="例: 期末レポート、プレゼン準備、コードレビュー..."
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleBreak}
              disabled={loading || !input.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  AIが分解中...
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
            <button
              onClick={handleDemo}
              disabled={loading}
              title="APIキー不要のサンプルデータで試せます"
              className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 text-sm font-bold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🎁 サンプル
            </button>
          </div>
          {!apiKey && (
            <p className="mt-2 text-center text-xs text-gray-400">
              APIキー無しで試したい人は「🎁 サンプル」から
            </p>
          )}
        </div>

        {/* ── Timer Panel ── */}
        {timerTask && (
          <TimerPanel
            task={timerTask}
            onDone={() => { toggleTask(timerTask.id); setTimerTaskId(null); }}
            onClose={() => setTimerTaskId(null)}
          />
        )}

        {/* ── Current task set ── */}
        {current && (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            {/* Header */}
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-gray-800">
                  📌 <span className="text-indigo-600">{current.topic}</span>
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  {new Date(current.createdAt).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button onClick={resetProgress} title="進捗をリセット"
                className="rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* ── 合格ライン ── */}
            <div className="mb-4">
              <PassLineField
                value={current.passLine ?? ""}
                onChange={setPassLine}
              />
            </div>

            {/* Stats row */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                合計 {total}分
              </span>
              {remaining > 0 && (
                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-600">
                  残り {remaining}分
                </span>
              )}
              <DeadlineBadge deadline={current.deadline} />
            </div>

            {/* Deadline input */}
            <div className="mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <label className="text-xs font-medium text-gray-500">締め切り</label>
              <input
                type="date"
                value={current.deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none transition focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
              />
              {current.deadline && (
                <button onClick={() => setDeadline("")} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              )}
            </div>

            {/* Progress */}
            <div className="mb-5">
              <div className="mb-1.5 flex justify-between text-xs text-gray-500">
                <span>進捗率</span>
                <span className="font-semibold">
                  {doneCount}/{current.tasks.length}完了 ({progress}%)
                </span>
              </div>
              <ProgressBar progress={progress} />
            </div>

            {/* Priority legend */}
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>優先度:</span>
              {(["high", "medium", "low"] as Priority[]).map((p) => (
                <span key={p} className="flex items-center gap-1">
                  <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_META[p].dot}`} />
                  {PRIORITY_META[p].label}
                </span>
              ))}
            </div>

            {/* Task list */}
            <ul className="space-y-2">
              {sortedTasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={i}
                  isTimerTarget={task.id === timerTaskId}
                  onToggle={() => toggleTask(task.id)}
                  onUpdate={(patch) => updateTask(task.id, patch)}
                  onDelete={() => deleteTask(task.id)}
                  onStartTimer={() => setTimerTaskId(task.id === timerTaskId ? null : task.id)}
                />
              ))}
            </ul>

            {/* Add task */}
            <button onClick={addTask}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-200 py-2.5 text-sm text-gray-400 transition hover:border-indigo-300 hover:text-indigo-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              タスクを追加
            </button>

            {/* Completion banner */}
            {progress === 100 && current.tasks.length > 0 && !current.review && (
              <div className="mt-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 text-center text-sm font-bold text-green-600 ring-1 ring-green-100">
                🎉 全タスク完了！下から今日を振り返りましょう
              </div>
            )}

            {/* ── 今日の振り返り ── */}
            <ReviewSection
              taskSet={current}
              onSave={saveReview}
              onReset={resetReview}
            />
          </div>
        )}

        {/* ── History ── */}
        {taskSets.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <button onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold text-gray-600">
              <span>履歴 ({taskSets.length}件)</span>
              <svg className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showHistory && (
              <ul className="mt-3 space-y-2">
                {taskSets.map((s) => {
                  const done = s.tasks.filter((t) => t.done).length;
                  const pct = s.tasks.length > 0 ? Math.round((done / s.tasks.length) * 100) : 0;
                  const totalMin = s.tasks.reduce((acc, t) => acc + t.minutes, 0);
                  return (
                    <li key={s.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                        s.id === currentId ? "border-indigo-200 bg-indigo-50" : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                      }`}
                      onClick={() => { setCurrentId(s.id); setTimerTaskId(null); }}>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-700">
                          {s.review && (
                            <span className={s.review.achieved ? "text-green-500" : "text-amber-500"}>
                              {s.review.achieved ? "👍" : "❌"}
                            </span>
                          )}
                          {s.topic}
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.tasks.length}タスク · {totalMin}分 · {pct}%完了
                          {s.deadline && ` · 期限${new Date(s.deadline).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}`}
                        </p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteSet(s.id); }}
                        className="rounded-full p-1 text-gray-300 hover:bg-red-50 hover:text-red-400">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <p className="pb-4 text-center text-xs text-gray-400">
          Task Breaker v4 · <a href="https://github.com/s24c3118ch-ops/task-breaker" target="_blank" rel="noreferrer" className="hover:text-indigo-500">GitHub</a>
        </p>
      </div>
    </main>
  );
}
