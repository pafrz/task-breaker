"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_KEY_STORAGE,
  FOCUS_TASK_STORAGE,
  genId,
  isDeepNight,
  isPastMidnight,
  loadSeenGuides,
  loadStorage,
  PRIORITY_META,
  saveSeenGuides,
  saveStorage,
  type GuideKey,
  type Priority,
  type Review,
  type Tab,
  type Task,
  type TaskSet,
} from "./lib";
import { Nem, resolveDialogue, type NemState } from "./nem";
import {
  CreateModal,
  DeadlineBadge,
  PassLineField,
  ProgressBar,
  ReviewSection,
  SmallNemHeader,
  TaskRow,
  TimerCore,
} from "./parts";

export default function Home() {
  // ─── Mount + storage state ────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [taskSets, setTaskSets] = useState<TaskSet[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [createOpen, setCreateOpen] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  const [seenGuides, setSeenGuides] = useState<Set<GuideKey>>(new Set());

  // Deep night (recomputed every minute)
  const [nightNow, setNightNow] = useState<Date>(() => new Date());
  const isDeepNightMode = useMemo(() => isDeepNight(nightNow), [nightNow]);
  const isPastMidnightMode = useMemo(() => isPastMidnight(nightNow), [nightNow]);

  useEffect(() => {
    const stored = loadStorage();
    setTaskSets(stored.taskSets);
    setCurrentId(stored.currentId);
    setApiKey(localStorage.getItem(API_KEY_STORAGE) ?? "");
    setFocusTaskId(
      (() => {
        const raw = localStorage.getItem(FOCUS_TASK_STORAGE);
        return raw ? parseInt(raw) : null;
      })()
    );
    setSeenGuides(loadSeenGuides());
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

  useEffect(() => {
    if (!mounted) return;
    if (focusTaskId !== null) localStorage.setItem(FOCUS_TASK_STORAGE, String(focusTaskId));
    else localStorage.removeItem(FOCUS_TASK_STORAGE);
  }, [focusTaskId, mounted]);

  // Recompute night status every minute
  useEffect(() => {
    const iv = setInterval(() => setNightNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Apply night mode via <html data-night>
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.night = isDeepNightMode ? "true" : "false";
  }, [isDeepNightMode]);

  // ─── Derived ──────────────────────────────────────────────────────────
  const current = taskSets.find((s) => s.id === currentId) ?? null;
  const total = current?.tasks.reduce((s, t) => s + t.minutes, 0) ?? 0;
  const remaining = current?.tasks.filter((t) => !t.done).reduce((s, t) => s + t.minutes, 0) ?? 0;
  const doneCount = current?.tasks.filter((t) => t.done).length ?? 0;
  const progress = current && current.tasks.length > 0
    ? Math.round((doneCount / current.tasks.length) * 100)
    : 0;
  const focusTask = current?.tasks.find((t) => t.id === focusTaskId) ?? null;

  const sortedTasks = current
    ? [...current.tasks].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const order: Priority[] = ["high", "medium", "low"];
        return order.indexOf(a.priority) - order.indexOf(b.priority);
      })
    : [];

  // Nem state for Home header
  const homeNemState: NemState = !current
    ? "empty"
    : progress === 100 && !current.review
    ? "all-done"
    : current.passLine
    ? "timer-idle"
    : "after-breakdown";

  // ─── Actions ──────────────────────────────────────────────────────────
  const markGuideSeen = useCallback(
    (key: GuideKey) => {
      setSeenGuides((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        saveSeenGuides(next);
        return next;
      });
    },
    []
  );

  function updateCurrent(fn: (s: TaskSet) => TaskSet) {
    setTaskSets((prev) => prev.map((s) => (s.id === currentId ? fn(s) : s)));
  }

  function handleCreate(topic: string, tasks: { label: string; minutes: number }[], deadline: string, passLine: string) {
    const newSet: TaskSet = {
      id: genId(),
      topic,
      tasks: tasks.map((t, i) => ({
        id: i + 1,
        label: t.label,
        minutes: t.minutes,
        done: false,
        priority: "medium" as Priority,
        memo: "",
      })),
      deadline,
      createdAt: Date.now(),
      passLine,
    };
    setTaskSets((prev) => [newSet, ...prev.slice(0, 19)]);
    setCurrentId(newSet.id);
    setFocusTaskId(null);
    setCreateOpen(false);
    markGuideSeen("home-empty-cta");
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
    if (focusTaskId === taskId) setFocusTaskId(null);
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
    markGuideSeen("passline-hint");
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
    setFocusTaskId(null);
  }

  function deleteSet(id: string) {
    setTaskSets((prev) => prev.filter((s) => s.id !== id));
    if (currentId === id) {
      setCurrentId(null);
      setFocusTaskId(null);
    }
  }

  function startFocus(taskId: number) {
    setFocusTaskId(taskId);
    setActiveTab("focus");
    markGuideSeen("task-timer");
    markGuideSeen("focus-tab-hint");
  }

  // ─── First-time guide flags ──────────────────────────────────────────
  const showHomeEmptyGuide = mounted && !current && !seenGuides.has("home-empty-cta");
  const showPassLineHint = !!(mounted && current && !current.passLine && !seenGuides.has("passline-hint"));
  const showTimerHint = mounted && !!current && !seenGuides.has("task-timer");
  const showFocusTabHint = mounted && !!focusTaskId && !seenGuides.has("focus-tab-hint");

  if (!mounted) return null;

  // ─── Layout ──────────────────────────────────────────────────────────

  return (
    <main
      className={`min-h-screen transition-colors ${
        isDeepNightMode ? "" : "bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50"
      }`}
    >
      <div className="mx-auto max-w-lg px-4 pt-6 pb-28">
        {/* ── Header ── */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1
              className={`text-3xl font-extrabold tracking-tight ${
                isDeepNightMode
                  ? "text-slate-200"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"
              }`}
            >
              Task Breaker
            </h1>
            <p className="text-xs text-gray-500 night-text-muted">
              {isDeepNightMode ? "🌙 深夜モード" : "徹夜を防ぐ、AIタスク管理"}
            </p>
          </div>
          <button
            onClick={() => setActiveTab("settings")}
            className="rounded-full p-2 text-gray-400 hover:bg-white/50 night-text-muted"
            title="設定"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* ── HOME ── */}
        {activeTab === "home" && (
          <div className="space-y-5 soft-appear">
            {/* Nem header — home only */}
            <SmallNemHeader
              state={homeNemState}
              isDeepNightMode={isDeepNightMode}
              isPastMidnightMode={isPastMidnightMode}
            />

            {!current ? (
              // Empty state — big CTA
              <div className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-100 night-card night-border">
                <p className="mb-3 text-base font-bold text-gray-800 night-text-body">
                  最初の課題を作ろう
                </p>
                <p className="mb-5 text-sm text-gray-500 night-text-muted">
                  課題を入れると、AIが「今日やること」に刻んでくれる
                </p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 py-4 text-base font-bold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-purple-700 active:scale-95 ${
                    showHomeEmptyGuide ? "glow-pulse" : ""
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  新しい課題を作る
                </button>
                {showHomeEmptyGuide && (
                  <p className="mt-3 flex items-center justify-center gap-1 text-xs text-indigo-500 night-text-accent">
                    <span className="bounce-arrow-down inline-block">↑</span>
                    ここから始めよう
                  </p>
                )}
              </div>
            ) : (
              // Active task set
              <>
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 night-card night-border">
                  {/* Title + reset */}
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-bold text-gray-800 night-text-body">
                        📌 <span className="text-indigo-600 night-text-accent">{current.topic}</span>
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-400 night-text-muted">
                        {new Date(current.createdAt).toLocaleString("ja-JP", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={resetProgress}
                      title="進捗をリセット"
                      className="rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500 night-text-muted"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>

                  {/* Pass line */}
                  <div className="mb-4">
                    <PassLineField
                      value={current.passLine ?? ""}
                      onChange={setPassLine}
                      showHint={showPassLineHint}
                    />
                  </div>

                  {/* Stats */}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 night-subcard night-text-accent">
                      合計 {total}分
                    </span>
                    {remaining > 0 && (
                      <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-600 night-subcard">
                        残り {remaining}分
                      </span>
                    )}
                    <DeadlineBadge deadline={current.deadline} />
                  </div>

                  {/* Deadline input */}
                  <div className="mb-4 flex items-center gap-2">
                    <svg className="h-4 w-4 flex-shrink-0 text-gray-400 night-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <label className="text-xs font-medium text-gray-500 night-text-muted">締め切り</label>
                    <input
                      type="date"
                      value={current.deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 night-input"
                    />
                    {current.deadline && (
                      <button onClick={() => setDeadline("")} className="text-xs text-gray-400 hover:text-gray-600 night-text-muted">✕</button>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mb-5">
                    <div className="mb-1.5 flex justify-between text-xs text-gray-500 night-text-muted">
                      <span>進捗率</span>
                      <span className="font-semibold text-gray-700 night-text-body">
                        {doneCount}/{current.tasks.length}完了 ({progress}%)
                      </span>
                    </div>
                    <ProgressBar progress={progress} />
                  </div>

                  {/* Priority legend */}
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-gray-400 night-text-muted">
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
                        isTimerTarget={task.id === focusTaskId}
                        showTimerHint={showTimerHint && i === 0 && !task.done}
                        onToggle={() => toggleTask(task.id)}
                        onUpdate={(patch) => updateTask(task.id, patch)}
                        onDelete={() => deleteTask(task.id)}
                        onStartTimer={() => startFocus(task.id)}
                      />
                    ))}
                  </ul>

                  {/* Add task */}
                  <button
                    onClick={addTask}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-200 py-2.5 text-sm text-gray-400 transition hover:border-indigo-300 hover:text-indigo-500 night-border night-text-muted"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    タスクを追加
                  </button>

                  {/* Completion notice */}
                  {progress === 100 && current.tasks.length > 0 && !current.review && (
                    <div className="mt-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 text-center text-sm font-bold text-green-600 ring-1 ring-green-100">
                      🎉 全タスク完了！ 「ログ」タブで振り返ろう
                    </div>
                  )}
                </div>

                {/* Big "focus this" button when a focus task selected */}
                {focusTask && (
                  <button
                    onClick={() => setActiveTab("focus")}
                    className={`w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-indigo-200 transition hover:ring-indigo-300 active:scale-[0.99] night-card ${
                      showFocusTabHint ? "pulse-ring" : ""
                    }`}
                  >
                    <p className="text-xs font-bold text-indigo-500 night-text-accent">▶ 集中モード継続中</p>
                    <p className="mt-1 truncate text-sm font-bold text-gray-800 night-text-body">{focusTask.label}</p>
                    <p className="mt-1 text-xs text-gray-400 night-text-muted">タップして集中タブへ →</p>
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── FOCUS ── */}
        {activeTab === "focus" && (
          <div className="soft-appear">
            {focusTask ? (
              <TimerCore
                task={focusTask}
                isDeepNightMode={isDeepNightMode}
                isPastMidnightMode={isPastMidnightMode}
                onDone={() => {
                  toggleTask(focusTask.id);
                  setFocusTaskId(null);
                  setActiveTab("home");
                }}
                onSkip={() => {
                  setFocusTaskId(null);
                  setActiveTab("home");
                }}
                onBackToHome={() => setActiveTab("home")}
              />
            ) : (
              // Empty state
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100 night-card night-border">
                <div className="mb-4 flex justify-center">
                  <Nem expression="default" size={100} />
                </div>
                <p className="mb-3 text-sm font-medium text-gray-700 night-text-body">
                  まだ集中してないよ。<br />「今日」からタスクを選んでね。
                </p>
                <button
                  onClick={() => setActiveTab("home")}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-purple-700"
                >
                  「今日」タブへ
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── LOG ── */}
        {activeTab === "log" && (
          <div className="space-y-4 soft-appear">
            {/* Today's review (only if all-done or 50%+ progress) */}
            {current && progress > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 night-text-muted">
                  今日
                </p>
                <ReviewSection
                  taskSet={current}
                  isDeepNightMode={isDeepNightMode}
                  isPastMidnightMode={isPastMidnightMode}
                  onSave={saveReview}
                  onReset={resetReview}
                />
              </div>
            )}
            {current && progress === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-400 night-card night-text-muted">
                今日はまだ集中中だよ。 完了したら振り返れるよ。
              </div>
            )}
            {!current && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-400 night-card night-text-muted">
                まだ課題を作ってないよ。 「今日」タブから作ってね。
              </div>
            )}

            {/* Past history */}
            {taskSets.filter((s) => s.id !== currentId).length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 night-text-muted">
                  過去 ({taskSets.length - (current ? 1 : 0)}件)
                </p>
                <ul className="space-y-2">
                  {taskSets.filter((s) => s.id !== currentId).map((s) => {
                    const done = s.tasks.filter((t) => t.done).length;
                    const pct = s.tasks.length > 0 ? Math.round((done / s.tasks.length) * 100) : 0;
                    const totalMin = s.tasks.reduce((acc, t) => acc + t.minutes, 0);
                    return (
                      <li
                        key={s.id}
                        className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm ring-1 ring-gray-50 night-card night-border"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-700 night-text-body">
                              {s.review && (
                                <span className={s.review.achieved ? "text-green-500" : "text-amber-500"}>
                                  {s.review.achieved ? "👍" : "❌"}
                                </span>
                              )}
                              {s.topic}
                            </p>
                            <p className="text-xs text-gray-400 night-text-muted">
                              {s.tasks.length}タスク · {totalMin}分 · {pct}%完了
                              {s.deadline &&
                                ` · 期限${new Date(s.deadline).toLocaleDateString("ja-JP", {
                                  month: "short", day: "numeric",
                                })}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setCurrentId(s.id); setActiveTab("home"); setFocusTaskId(null); }}
                              className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 night-subcard night-text-accent"
                            >
                              開く
                            </button>
                            <button
                              onClick={() => deleteSet(s.id)}
                              className="rounded-full p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {s.review?.memo && (
                          <p className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-500 night-subcard night-text-muted">
                            {s.review.memo}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab === "settings" && (
          <div className="space-y-4 soft-appear">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 night-text-muted">
              設定
            </p>

            {/* API Key */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 night-card night-border">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 night-text-muted">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                OpenAI API キー
                {apiKey && <span className="text-green-500">✓ 設定済</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 night-input"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="rounded-xl border border-gray-200 px-3 text-gray-400 hover:bg-gray-50 night-border"
                >
                  {showKey ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400 night-text-muted">
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-500 underline hover:text-indigo-700 night-text-accent"
                >
                  platform.openai.com/api-keys
                </a>
                {" "}で取得。ブラウザにのみ保存、外部送信なし。
              </p>
            </div>

            {/* Notification */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 night-card night-border">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 night-text-muted">
                通知
              </p>
              <p className="mb-3 text-sm text-gray-600 night-text-body">
                タイマー超過時に音とブラウザ通知でお知らせします。
              </p>
              <button
                onClick={async () => {
                  if (typeof Notification !== "undefined") {
                    await Notification.requestPermission();
                    location.reload();
                  }
                }}
                className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-100 night-subcard night-text-accent"
              >
                通知を許可する
              </button>
              {typeof Notification !== "undefined" && (
                <p className="mt-2 text-xs text-gray-400 night-text-muted">
                  現在: <span className="font-mono">{Notification.permission}</span>
                </p>
              )}
            </div>

            {/* About */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 night-card night-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 night-text-muted">
                Task Breaker v5
              </p>
              <p className="mt-1 text-xs text-gray-500 night-text-muted">
                徹夜を防ぐAIタスク管理・ネムが見守るタブ式UI
              </p>
              <p className="mt-2 text-xs text-gray-400 night-text-muted">
                <a
                  href="https://github.com/s24c3118ch-ops/task-breaker"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-500 underline hover:text-indigo-700 night-text-accent"
                >
                  GitHub リポジトリ
                </a>
              </p>
            </div>

            {/* Reset seen guides */}
            <button
              onClick={() => {
                setSeenGuides(new Set());
                saveSeenGuides(new Set());
              }}
              className="w-full text-xs text-gray-400 underline hover:text-gray-600 night-text-muted"
            >
              初回ガイドをもう一度見る
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Tab Bar ── */}
      <BottomTabBar
        active={activeTab}
        onChange={setActiveTab}
        hasFocus={!!focusTask}
        isDeepNight={isDeepNightMode}
        onCreate={() => setCreateOpen(true)}
      />

      {/* ── Create Modal ── */}
      <CreateModal
        open={createOpen}
        apiKey={apiKey}
        isDeepNightMode={isDeepNightMode}
        isPastMidnightMode={isPastMidnightMode}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        onOpenApiSettings={() => {
          setCreateOpen(false);
          setActiveTab("settings");
        }}
      />
    </main>
  );
}

// ─── BottomTabBar ────────────────────────────────────────────────────────────

function BottomTabBar({
  active,
  onChange,
  hasFocus,
  isDeepNight,
  onCreate,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  hasFocus: boolean;
  isDeepNight: boolean;
  onCreate: () => void;
}) {
  const tabs: { id: Tab; emoji: string; label: string; disabled?: boolean }[] = [
    { id: "home", emoji: "🌱", label: "今日" },
    { id: "focus", emoji: "⏱️", label: "集中" },
    { id: "log", emoji: "📓", label: "ログ" },
    { id: "settings", emoji: "⚙️", label: "設定" },
  ];

  return (
    <>
      {/* FAB — only visible in Home tab */}
      {active === "home" && (
        <button
          onClick={onCreate}
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-300 transition hover:scale-105 active:scale-95"
          aria-label="新しい課題を作る"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      <nav
        className={`fixed inset-x-0 bottom-0 z-20 tabbar-safe-area border-t backdrop-blur-md ${
          isDeepNight
            ? "border-slate-700 bg-slate-900/90"
            : "border-gray-100 bg-white/90"
        }`}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-2">
          {tabs.map((t) => {
            const isActive = active === t.id;
            const highlightFocus = t.id === "focus" && hasFocus && !isActive;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition ${
                  isActive
                    ? isDeepNight
                      ? "bg-slate-800 text-slate-100"
                      : "bg-indigo-50 text-indigo-600"
                    : isDeepNight
                    ? "text-slate-400 hover:bg-slate-800"
                    : "text-gray-400 hover:bg-gray-50"
                } ${highlightFocus ? "pulse-ring" : ""}`}
              >
                <span className={`text-lg leading-none ${isActive ? "" : "opacity-70"}`}>{t.emoji}</span>
                <span className={`text-[10px] font-bold ${isActive ? "" : ""}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
