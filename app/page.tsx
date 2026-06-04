"use client";

import { useState, useEffect, useRef } from "react";

type Task = {
  id: number;
  label: string;
  minutes: number;
  done: boolean;
};

type TaskSet = {
  id: string;
  topic: string;
  tasks: Task[];
  createdAt: number;
};

const STORAGE_KEY = "task-breaker-data";
const API_KEY_STORAGE = "task-breaker-api-key";

function genId() {
  return Math.random().toString(36).slice(2);
}

function loadFromStorage(): { taskSets: TaskSet[]; currentId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { taskSets: [], currentId: null };
    return JSON.parse(raw);
  } catch {
    return { taskSets: [], currentId: null };
  }
}

function saveToStorage(taskSets: TaskSet[], currentId: string | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ taskSets, currentId }));
}

// ───────────────────────────────────────────────────────
// Mini components
// ───────────────────────────────────────────────────────

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

function TaskRow({
  task,
  index,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: Task;
  index: number;
  onToggle: () => void;
  onUpdate: (label: string, minutes: number) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(task.label);
  const [draftMin, setDraftMin] = useState(String(task.minutes));
  const labelRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraftLabel(task.label);
    setDraftMin(String(task.minutes));
    setEditing(true);
    setTimeout(() => labelRef.current?.focus(), 0);
  }

  function commitEdit() {
    const mins = Math.max(1, Math.min(999, parseInt(draftMin) || task.minutes));
    onUpdate(draftLabel.trim() || task.label, mins);
    setEditing(false);
  }

  return (
    <li
      className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200 ${
        task.done
          ? "border-green-100 bg-green-50/70"
          : "border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          task.done
            ? "border-green-500 bg-green-500"
            : "border-gray-300 hover:border-indigo-400"
        }`}
      >
        {task.done && (
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Step # */}
      <span className="w-4 flex-shrink-0 text-center text-xs font-bold text-gray-300">
        {index + 1}
      </span>

      {/* Label / editor */}
      {editing ? (
        <div className="flex flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            ref={labelRef}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            className="flex-1 rounded-lg border border-indigo-300 px-2 py-0.5 text-sm outline-none ring-2 ring-indigo-100"
          />
          <input
            value={draftMin}
            onChange={(e) => setDraftMin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            type="number"
            min={1}
            max={999}
            className="w-16 rounded-lg border border-indigo-300 px-2 py-0.5 text-center text-sm outline-none ring-2 ring-indigo-100"
          />
          <span className="text-xs text-gray-400">分</span>
          <button onClick={commitEdit} className="rounded-lg bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-indigo-700">保存</button>
          <button onClick={() => setEditing(false)} className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-200">✕</button>
        </div>
      ) : (
        <>
          <span
            className={`flex-1 text-sm font-medium leading-snug ${
              task.done ? "text-gray-400 line-through" : "text-gray-700"
            }`}
          >
            {task.label}
          </span>
          {/* Time badge */}
          <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200">
            {task.minutes}分
          </span>
          {/* Edit / delete (shown on hover) */}
          <div className="hidden items-center gap-1 group-hover:flex">
            <button
              onClick={startEdit}
              title="編集"
              className="rounded p-1 text-gray-400 hover:bg-indigo-100 hover:text-indigo-600"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6m-6 6l-3 4h4l5-5" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              title="削除"
              className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-500"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </>
      )}
    </li>
  );
}

// ───────────────────────────────────────────────────────
// Main Page
// ───────────────────────────────────────────────────────

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [input, setInput] = useState("");
  const [taskSets, setTaskSets] = useState<TaskSet[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Hydration
  useEffect(() => {
    const stored = loadFromStorage();
    setTaskSets(stored.taskSets);
    setCurrentId(stored.currentId);
    const key = localStorage.getItem(API_KEY_STORAGE) ?? "";
    setApiKey(key);
    setMounted(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!mounted) return;
    saveToStorage(taskSets, currentId);
  }, [taskSets, currentId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey, mounted]);

  const current = taskSets.find((s) => s.id === currentId) ?? null;
  const total = current ? current.tasks.reduce((s, t) => s + t.minutes, 0) : 0;
  const doneCount = current ? current.tasks.filter((t) => t.done).length : 0;
  const progress = current && current.tasks.length > 0
    ? Math.round((doneCount / current.tasks.length) * 100)
    : 0;

  // ── Actions ──────────────────────────────────────────

  async function handleBreak() {
    if (!input.trim()) return;
    if (!apiKey.trim()) { setError("APIキーを入力してください"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: input.trim(), apiKey }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const newSet: TaskSet = {
        id: genId(),
        topic: input.trim(),
        tasks: (data.tasks as { label: string; minutes: number }[]).map(
          (t, i) => ({ id: i + 1, label: t.label, minutes: t.minutes, done: false })
        ),
        createdAt: Date.now(),
      };
      setTaskSets((prev) => [newSet, ...prev.slice(0, 19)]);
      setCurrentId(newSet.id);
      setInput("");
    } catch (e: unknown) {
      setError((e as Error).message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function toggleTask(taskId: number) {
    setTaskSets((prev) =>
      prev.map((s) =>
        s.id !== currentId
          ? s
          : { ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) }
      )
    );
  }

  function updateTask(taskId: number, label: string, minutes: number) {
    setTaskSets((prev) =>
      prev.map((s) =>
        s.id !== currentId
          ? s
          : { ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, label, minutes } : t)) }
      )
    );
  }

  function deleteTask(taskId: number) {
    setTaskSets((prev) =>
      prev.map((s) =>
        s.id !== currentId ? s : { ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }
      )
    );
  }

  function addTask() {
    if (!current) return;
    const maxId = current.tasks.reduce((m, t) => Math.max(m, t.id), 0);
    setTaskSets((prev) =>
      prev.map((s) =>
        s.id !== currentId
          ? s
          : { ...s, tasks: [...s.tasks, { id: maxId + 1, label: "新しいタスク", minutes: 15, done: false }] }
      )
    );
  }

  function deleteSet(id: string) {
    setTaskSets((prev) => prev.filter((s) => s.id !== id));
    if (currentId === id) setCurrentId(null);
  }

  function resetProgress() {
    setTaskSets((prev) =>
      prev.map((s) =>
        s.id !== currentId ? s : { ...s, tasks: s.tasks.map((t) => ({ ...t, done: false })) }
      )
    );
  }

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-5">
        {/* ── Header ── */}
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            Task Breaker
          </h1>
          <p className="mt-1 text-sm text-gray-500">課題をAIがタスクに分解します</p>
        </div>

        {/* ── API Key ── */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Anthropic API キー
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-gray-400 hover:bg-gray-50"
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
          <p className="mt-1.5 text-xs text-gray-400">
            キーはブラウザのローカルストレージのみに保存されます
          </p>
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
            placeholder="例: プレゼン資料の作成、期末レポート、コードレビュー..."
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}
          <button
            onClick={handleBreak}
            disabled={loading || !input.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                分解する
              </>
            )}
          </button>
        </div>

        {/* ── Current task set ── */}
        {current && (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            {/* Header row */}
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-gray-800">
                  課題: <span className="text-indigo-600">{current.topic}</span>
                </h2>
                <p className="text-xs text-gray-400">
                  {new Date(current.createdAt).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                  合計 {total} 分
                </span>
                <button
                  onClick={resetProgress}
                  title="進捗をリセット"
                  className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-5">
              <div className="mb-1.5 flex justify-between text-xs text-gray-500">
                <span>進捗率</span>
                <span className="font-semibold">
                  {doneCount}/{current.tasks.length} 完了 ({progress}%)
                </span>
              </div>
              <ProgressBar progress={progress} />
            </div>

            {/* Task list */}
            <ul className="space-y-2">
              {current.tasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={i}
                  onToggle={() => toggleTask(task.id)}
                  onUpdate={(label, minutes) => updateTask(task.id, label, minutes)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))}
            </ul>

            {/* Add task */}
            <button
              onClick={addTask}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-200 py-2.5 text-sm text-gray-400 transition hover:border-indigo-300 hover:text-indigo-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              タスクを追加
            </button>

            {/* Completion banner */}
            {progress === 100 && current.tasks.length > 0 && (
              <div className="mt-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 text-center text-sm font-bold text-green-600 ring-1 ring-green-100">
                🎉 すべてのタスクが完了しました！
              </div>
            )}
          </div>
        )}

        {/* ── History ── */}
        {taskSets.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold text-gray-600"
            >
              <span>履歴 ({taskSets.length}件)</span>
              <svg
                className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
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
                    <li
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                        s.id === currentId
                          ? "border-indigo-200 bg-indigo-50"
                          : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                      }`}
                      onClick={() => setCurrentId(s.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-gray-700">{s.topic}</p>
                        <p className="text-xs text-gray-400">
                          {s.tasks.length}タスク · {totalMin}分 · {pct}%完了
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSet(s.id); }}
                        className="rounded-full p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
                      >
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
      </div>
    </main>
  );
}
