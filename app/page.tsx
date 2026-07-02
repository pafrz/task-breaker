"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type DraftStatus =
  | "queued"
  | "drafting"
  | "awaiting-review"
  | "revising"
  | "approved";

type DraftAttempt = {
  id: string;
  content: string;
  feedback?: string; // if this attempt was produced in response to feedback
  createdAt: number;
  streaming: boolean;
};

type Task = {
  id: string;
  label: string;
  description: string;
  status: DraftStatus;
  drafts: DraftAttempt[];
  viewingIdx: number;
};

type ActivityKind =
  | "breakdown"
  | "draft-start"
  | "draft-complete"
  | "revise-start"
  | "revise-complete"
  | "approve"
  | "error";

type ActivityEvent = {
  id: string;
  taskId?: string;
  timestamp: number;
  kind: ActivityKind;
  message: string;
};

type Goal = {
  id: string;
  topic: string;
  tasks: Task[];
  events: ActivityEvent[];
  createdAt: number;
  focusedTaskId: string | null;
};

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "task-breaker-v3";
const API_KEY_STORAGE = "task-breaker-openai-key";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadStorage(): { goals: Goal[]; currentId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { goals: [], currentId: null };
    return JSON.parse(raw);
  } catch {
    return { goals: [], currentId: null };
  }
}

function saveStorage(goals: Goal[], currentId: string | null) {
  try {
    // strip streaming flags before saving — they belong to volatile session state
    const sanitized = goals.map((g) => ({
      ...g,
      tasks: g.tasks.map((t) => ({
        ...t,
        status:
          t.status === "drafting" || t.status === "revising"
            ? "queued"
            : t.status,
        drafts: t.drafts.map((d) => ({ ...d, streaming: false })),
      })),
    }));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ goals: sanitized, currentId })
    );
  } catch {
    /* ignore quota errors */
  }
}

// ─── SSE Helpers ─────────────────────────────────────────────────────────────

type SSEHandlers = {
  onStart?: (data: Record<string, unknown>) => void;
  onChunk?: (data: { text: string }) => void;
  onDone?: (data: Record<string, unknown>) => void;
  onError?: (data: { message: string }) => void;
};

async function streamSSE(
  url: string,
  body: unknown,
  handlers: SSEHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    // Not a stream — try to parse as JSON error
    try {
      const data = (await res.json()) as { error?: string };
      handlers.onError?.({ message: data.error ?? `HTTP ${res.status}` });
    } catch {
      handlers.onError?.({ message: `HTTP ${res.status}` });
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        // Parse SSE event
        let eventName = "message";
        let dataStr = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event: ")) eventName = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr += line.slice(6);
        }
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (eventName === "start") handlers.onStart?.(data);
            else if (eventName === "chunk") handlers.onChunk?.(data);
            else if (eventName === "done") handlers.onDone?.(data);
            else if (eventName === "error") handlers.onError?.(data);
          } catch {
            /* swallow malformed */
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } catch (e: unknown) {
    if ((e as Error).name !== "AbortError") {
      handlers.onError?.({ message: (e as Error).message ?? "stream error" });
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const STATUS_META: Record<
  DraftStatus,
  { label: string; color: string; dot: string }
> = {
  queued: {
    label: "待機",
    color: "text-fg-2",
    dot: "bg-fg-2",
  },
  drafting: {
    label: "AI執筆中",
    color: "text-accent",
    dot: "bg-accent pulse-dot",
  },
  "awaiting-review": {
    label: "レビュー待ち",
    color: "text-cyan",
    dot: "bg-cyan",
  },
  revising: {
    label: "改訂中",
    color: "text-warn",
    dot: "bg-warn pulse-dot",
  },
  approved: {
    label: "承認済み",
    color: "text-success",
    dot: "bg-success",
  },
};

// ─── Small UI atoms ──────────────────────────────────────────────────────────

function StatusPill({ status }: { status: DraftStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest ${m.color}`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${m.dot}`}
        style={{ color: "currentColor" }}
      />
      {m.label}
    </span>
  );
}

function IconArrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={dir === "left" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
      />
    </svg>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [topicInput, setTopicInput] = useState("");
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState("");

  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Aborters per taskId — used to cancel streams if user restarts
  const abortersRef = useRef<Map<string, AbortController>>(new Map());

  // Latest-state refs — needed because runDraft/runRevise are captured with
  // stale closures if they read goals/apiKey directly.
  const goalsRef = useRef<Goal[]>([]);
  const apiKeyRef = useRef<string>("");
  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  // ── mount / persist ──────────────────────────────────────────────────────
  // Hydrate from localStorage exactly once after mount. `mounted` gates
  // rendering so we never emit server HTML that would mismatch client state.
  useEffect(() => {
    const stored = loadStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoals(stored.goals);
    setCurrentId(stored.currentId);
    setApiKey(localStorage.getItem(API_KEY_STORAGE) ?? "");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    saveStorage(goals, currentId);
  }, [goals, currentId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey, mounted]);

  const goal = useMemo(
    () => goals.find((g) => g.id === currentId) ?? null,
    [goals, currentId]
  );

  const focusedTask = useMemo(() => {
    if (!goal) return null;
    return (
      goal.tasks.find((t) => t.id === goal.focusedTaskId) ??
      goal.tasks[0] ??
      null
    );
  }, [goal]);

  // ── mutation helpers ─────────────────────────────────────────────────────

  const updateGoal = useCallback(
    (goalId: string, fn: (g: Goal) => Goal) => {
      setGoals((prev) => prev.map((g) => (g.id === goalId ? fn(g) : g)));
    },
    []
  );

  const addEvent = useCallback(
    (
      goalId: string,
      kind: ActivityKind,
      message: string,
      taskId?: string
    ) => {
      updateGoal(goalId, (g) => ({
        ...g,
        events: [
          ...g.events,
          {
            id: genId(),
            timestamp: Date.now(),
            kind,
            message,
            taskId,
          },
        ],
      }));
    },
    [updateGoal]
  );

  const patchTask = useCallback(
    (goalId: string, taskId: string, patch: Partial<Task> | ((t: Task) => Partial<Task>)) => {
      updateGoal(goalId, (g) => ({
        ...g,
        tasks: g.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const p = typeof patch === "function" ? patch(t) : patch;
          return { ...t, ...p };
        }),
      }));
    },
    [updateGoal]
  );

  const setFocusedTask = useCallback(
    (goalId: string, taskId: string) => {
      updateGoal(goalId, (g) => ({ ...g, focusedTaskId: taskId }));
    },
    [updateGoal]
  );

  // ── Draft stream orchestration ───────────────────────────────────────────

  const runDraft = useCallback(
    async (goalId: string, taskId: string) => {
      const g = goalsRef.current.find((x) => x.id === goalId);
      if (!g) return;
      const t = g.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const key = apiKeyRef.current;
      if (!key) return;

      // Cancel any existing stream for this task
      abortersRef.current.get(taskId)?.abort();
      const ac = new AbortController();
      abortersRef.current.set(taskId, ac);

      // Create fresh draft entry
      const draftId = genId();
      const newDraft: DraftAttempt = {
        id: draftId,
        content: "",
        createdAt: Date.now(),
        streaming: true,
      };

      patchTask(goalId, taskId, (cur) => ({
        status: "drafting",
        drafts: [...cur.drafts, newDraft],
        viewingIdx: cur.drafts.length, // point at the new one
      }));

      addEvent(goalId, "draft-start", `「${t.label}」のドラフトを開始`, taskId);

      // Pass all task labels/descriptions so the AI can align tone/theme
      // across parallel drafts and know its place in the whole.
      const siblings = g.tasks.map((x) => ({
        label: x.label,
        description: x.description,
      }));

      await streamSSE(
        "/api/draft",
        {
          topic: g.topic,
          task: { label: t.label, description: t.description },
          siblings,
          apiKey: key,
        },
        {
          onChunk: ({ text }) => {
            setGoals((prev) =>
              prev.map((gg) =>
                gg.id !== goalId
                  ? gg
                  : {
                      ...gg,
                      tasks: gg.tasks.map((tt) =>
                        tt.id !== taskId
                          ? tt
                          : {
                              ...tt,
                              drafts: tt.drafts.map((d) =>
                                d.id !== draftId
                                  ? d
                                  : { ...d, content: d.content + text }
                              ),
                            }
                      ),
                    }
              )
            );
          },
          onDone: () => {
            patchTask(goalId, taskId, (cur) => ({
              status: "awaiting-review",
              drafts: cur.drafts.map((d) =>
                d.id === draftId ? { ...d, streaming: false } : d
              ),
            }));
            addEvent(goalId, "draft-complete", `「${t.label}」のドラフトが完成`, taskId);
          },
          onError: ({ message }) => {
            patchTask(goalId, taskId, (cur) => ({
              status: "queued",
              drafts: cur.drafts.filter((d) => d.id !== draftId),
              viewingIdx: Math.max(0, cur.drafts.length - 2),
            }));
            addEvent(goalId, "error", `${t.label}: ${message}`, taskId);
          },
        },
        ac.signal
      );

      abortersRef.current.delete(taskId);
    },
    [patchTask, addEvent]
  );

  const runRevise = useCallback(
    async (goalId: string, taskId: string, feedback: string | undefined) => {
      const g = goalsRef.current.find((x) => x.id === goalId);
      if (!g) return;
      const t = g.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const key = apiKeyRef.current;
      if (!key) return;

      const currentDraft = t.drafts[t.viewingIdx];
      if (!currentDraft || !currentDraft.content.trim()) return;

      abortersRef.current.get(taskId)?.abort();
      const ac = new AbortController();
      abortersRef.current.set(taskId, ac);

      const draftId = genId();
      const newDraft: DraftAttempt = {
        id: draftId,
        content: "",
        feedback,
        createdAt: Date.now(),
        streaming: true,
      };

      patchTask(goalId, taskId, (cur) => ({
        status: "revising",
        drafts: [...cur.drafts, newDraft],
        viewingIdx: cur.drafts.length,
      }));

      const kindLabel = feedback ? "改訂" : "書き直し";
      addEvent(goalId, "revise-start", `「${t.label}」の${kindLabel}を開始`, taskId);

      await streamSSE(
        "/api/revise",
        {
          topic: g.topic,
          task: { label: t.label, description: t.description },
          previousDraft: currentDraft.content,
          feedback,
          apiKey: key,
        },
        {
          onChunk: ({ text }) => {
            setGoals((prev) =>
              prev.map((gg) =>
                gg.id !== goalId
                  ? gg
                  : {
                      ...gg,
                      tasks: gg.tasks.map((tt) =>
                        tt.id !== taskId
                          ? tt
                          : {
                              ...tt,
                              drafts: tt.drafts.map((d) =>
                                d.id !== draftId
                                  ? d
                                  : { ...d, content: d.content + text }
                              ),
                            }
                      ),
                    }
              )
            );
          },
          onDone: () => {
            patchTask(goalId, taskId, (cur) => ({
              status: "awaiting-review",
              drafts: cur.drafts.map((d) =>
                d.id === draftId ? { ...d, streaming: false } : d
              ),
            }));
            addEvent(goalId, "revise-complete", `「${t.label}」の${kindLabel}が完成`, taskId);
          },
          onError: ({ message }) => {
            patchTask(goalId, taskId, (cur) => ({
              status: "awaiting-review",
              drafts: cur.drafts.filter((d) => d.id !== draftId),
              viewingIdx: Math.max(0, cur.drafts.length - 2),
            }));
            addEvent(goalId, "error", `${t.label}: ${message}`, taskId);
          },
        },
        ac.signal
      );

      abortersRef.current.delete(taskId);
    },
    [patchTask, addEvent]
  );

  // ── Breakdown (create a new goal) ────────────────────────────────────────

  const handleBreakdown = useCallback(async () => {
    if (!topicInput.trim()) return;
    if (!apiKey.trim()) {
      setBreakdownError("APIキーを入力してください");
      return;
    }
    setBreakdownError("");
    setBreakdownLoading(true);
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicInput.trim(), apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const tasks: Task[] = (
        data.tasks as { label: string; description: string }[]
      ).map((raw) => ({
        id: genId(),
        label: raw.label,
        description: raw.description,
        status: "queued",
        drafts: [],
        viewingIdx: 0,
      }));

      const newGoal: Goal = {
        id: genId(),
        topic: topicInput.trim(),
        tasks,
        events: [
          {
            id: genId(),
            timestamp: Date.now(),
            kind: "breakdown",
            message: `ゴールを ${tasks.length} タスクに分解`,
          },
        ],
        createdAt: Date.now(),
        focusedTaskId: tasks[0]?.id ?? null,
      };

      // Sync ref immediately so runDraft() sees the new goal even before
      // React has committed the setGoals update.
      goalsRef.current = [newGoal, ...goalsRef.current.slice(0, 9)];

      setGoals((prev) => [newGoal, ...prev.slice(0, 9)]);
      setCurrentId(newGoal.id);
      setTopicInput("");
      setFeedbackOpen(false);
      setFeedbackDraft("");

      // Kick off drafts in parallel for all tasks
      for (const t of tasks) {
        void runDraft(newGoal.id, t.id);
      }
    } catch (e: unknown) {
      setBreakdownError((e as Error).message ?? "エラーが発生しました");
    } finally {
      setBreakdownLoading(false);
    }
  }, [topicInput, apiKey, runDraft]);

  // ── Review actions ───────────────────────────────────────────────────────

  const approveTask = useCallback(
    (goalId: string, taskId: string) => {
      const g = goals.find((x) => x.id === goalId);
      const t = g?.tasks.find((x) => x.id === taskId);
      if (!t) return;
      patchTask(goalId, taskId, { status: "approved" });
      addEvent(goalId, "approve", `「${t.label}」を承認`, taskId);
      setFeedbackOpen(false);
      setFeedbackDraft("");
    },
    [goals, patchTask, addEvent]
  );

  const submitFeedback = useCallback(
    (goalId: string, taskId: string) => {
      const text = feedbackDraft.trim();
      if (!text) return;
      setFeedbackOpen(false);
      setFeedbackDraft("");
      void runRevise(goalId, taskId, text);
    },
    [feedbackDraft, runRevise]
  );

  const retryTask = useCallback(
    (goalId: string, taskId: string) => {
      void runRevise(goalId, taskId, undefined);
    },
    [runRevise]
  );

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    const map = abortersRef.current;
    return () => {
      for (const ac of map.values()) ac.abort();
    };
  }, []);

  // ── Aggregate stats ──────────────────────────────────────────────────────

  const approvedCount = goal
    ? goal.tasks.filter((t) => t.status === "approved").length
    : 0;
  const totalCount = goal?.tasks.length ?? 0;
  const anyActive = goal
    ? goal.tasks.some((t) => t.status === "drafting" || t.status === "revising")
    : false;

  if (!mounted) return null;

  // ── Render: Empty state ──────────────────────────────────────────────────

  if (!goal) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-0 px-6 py-16">
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, #8b5cf6, transparent 70%)" }}
          />
          <div
            className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, #67e8f9, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 w-full max-w-2xl space-y-10">
          <div className="text-center space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-fg-2">
              Task Breaker · 指揮者モード
            </p>
            <h1 className="text-5xl font-semibold tracking-tight text-fg-0 sm:text-6xl">
              ゴールを渡す。<br />
              <span className="text-accent">AIが書き上げる。</span>
            </h1>
            <p className="mx-auto max-w-lg pt-4 text-sm leading-relaxed text-fg-1">
              あなたが書くのは、ゴールと承認・修正指示だけ。
              タスク分解から本文執筆まで、AIがループを閉じる。
              あなたは指揮者として、次の可能性を考え続けられる。
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-2">
                <span>OpenAI API Key</span>
                <span className="text-fg-2/50">·</span>
                <span>sk-...</span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-md border border-border bg-bg-1 px-4 py-3 font-mono text-sm text-fg-0 placeholder-fg-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1.5 text-[11px] text-fg-2">
                ブラウザのローカルストレージにのみ保存されます。サーバーには残りません。
              </p>
            </div>

            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-fg-2">
                ゴール
              </label>
              <textarea
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleBreakdown();
                }}
                rows={3}
                placeholder="例: web3概論の最終発表 (10分) の原稿を書く。テーマは『ループを閉じるAIとは何か』。"
                className="w-full resize-none rounded-md border border-border bg-bg-1 px-4 py-3 text-sm leading-relaxed text-fg-0 placeholder-fg-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {breakdownError && (
                <p className="mt-2 text-sm text-danger">{breakdownError}</p>
              )}
            </div>

            <button
              onClick={handleBreakdown}
              disabled={breakdownLoading || !topicInput.trim() || !apiKey.trim()}
              className="group relative w-full overflow-hidden rounded-md border border-accent bg-accent/10 py-3.5 font-medium text-fg-0 transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {breakdownLoading ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-fg-0 border-t-transparent" />
                    <span>AIが分解しています…</span>
                  </>
                ) : (
                  <>
                    <span>▶</span>
                    <span>指揮を始める</span>
                    <span className="ml-2 font-mono text-xs text-fg-2 group-hover:text-fg-1">⌘↵</span>
                  </>
                )}
              </span>
            </button>
          </div>

          {goals.length > 0 && (
            <div className="pt-8 border-t border-border">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-fg-2">
                過去のゴール
              </p>
              <ul className="space-y-1.5">
                {goals.slice(0, 5).map((g) => (
                  <li key={g.id}>
                    <button
                      onClick={() => setCurrentId(g.id)}
                      className="flex w-full items-center justify-between rounded border border-transparent px-3 py-2 text-left text-sm text-fg-1 transition hover:border-border hover:bg-bg-1 hover:text-fg-0"
                    >
                      <span className="truncate">{g.topic}</span>
                      <span className="ml-3 flex-shrink-0 font-mono text-[10px] text-fg-2">
                        {g.tasks.filter((t) => t.status === "approved").length}/
                        {g.tasks.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── Render: Command Deck ─────────────────────────────────────────────────

  return (
    <main className="flex h-screen flex-col bg-bg-0 text-fg-0">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-bg-0 px-6 py-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-2">
              指揮
            </span>
            {anyActive && (
              <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
                AI活動中
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-fg-0">{goal.topic}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-fg-2">
            {approvedCount}/{totalCount} 承認
          </span>
          <button
            onClick={() => setShowPreview(true)}
            className="rounded border border-accent/40 bg-accent/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-accent transition hover:bg-accent/15"
          >
            全体プレビュー
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="rounded border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-1 transition hover:border-border-strong hover:text-fg-0"
          >
            履歴
          </button>
          <button
            onClick={() => {
              for (const ac of abortersRef.current.values()) ac.abort();
              abortersRef.current.clear();
              setCurrentId(null);
            }}
            className="rounded border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-1 transition hover:border-accent hover:text-accent"
          >
            + 新しいゴール
          </button>
        </div>
      </header>

      {/* 3-Pane body */}
      <div className="grid flex-1 min-h-0 grid-cols-[280px_1fr_320px]">
        {/* LEFT: Tasks */}
        <aside className="flex flex-col overflow-hidden border-r border-border bg-bg-1">
          <div className="border-b border-border px-4 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-2">
              タスク · {goal.tasks.length}
            </p>
          </div>
          <ul className="flex-1 space-y-px overflow-y-auto">
            {goal.tasks.map((t, i) => {
              const isFocused = focusedTask?.id === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      setFocusedTask(goal.id, t.id);
                      setFeedbackOpen(false);
                    }}
                    className={`group flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition ${
                      isFocused
                        ? "border-l-accent bg-bg-2"
                        : "border-l-transparent hover:bg-bg-2/50"
                    }`}
                  >
                    <span className="mt-0.5 font-mono text-[11px] text-fg-2">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={`text-sm leading-snug ${
                        t.status === "approved" ? "text-fg-2" : "text-fg-0"
                      }`}>
                        {t.label}
                      </p>
                      <StatusPill status={t.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* CENTER: Draft */}
        <section className="flex flex-col overflow-hidden bg-bg-0">
          {focusedTask ? (
            <FocusedTaskView
              task={focusedTask}
              goal={goal}
              onApprove={() => approveTask(goal.id, focusedTask.id)}
              onOpenFeedback={() => {
                setFeedbackOpen(true);
                setFeedbackDraft("");
              }}
              onRetry={() => retryTask(goal.id, focusedTask.id)}
              onStart={() => runDraft(goal.id, focusedTask.id)}
              onSwitchDraft={(idx) =>
                patchTask(goal.id, focusedTask.id, { viewingIdx: idx })
              }
              feedbackOpen={feedbackOpen}
              feedbackDraft={feedbackDraft}
              onFeedbackChange={setFeedbackDraft}
              onFeedbackCancel={() => {
                setFeedbackOpen(false);
                setFeedbackDraft("");
              }}
              onFeedbackSubmit={() => submitFeedback(goal.id, focusedTask.id)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-fg-2">
              タスクを選択してください
            </div>
          )}
        </section>

        {/* RIGHT: Activity log */}
        <aside className="flex flex-col overflow-hidden border-l border-border bg-bg-1">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-2">
              AI活動ログ
            </p>
            <span className="font-mono text-[10px] text-fg-2">
              {goal.events.length}
            </span>
          </div>
          <ActivityLog events={goal.events} />
        </aside>
      </div>

      {/* History overlay */}
      {showHistory && (
        <HistoryOverlay
          goals={goals}
          currentId={currentId}
          onSelect={(id) => {
            setCurrentId(id);
            setShowHistory(false);
          }}
          onDelete={(id) => {
            setGoals((prev) => prev.filter((g) => g.id !== id));
            if (currentId === id) setCurrentId(null);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Preview overlay */}
      {showPreview && (
        <PreviewOverlay
          goal={goal}
          onClose={() => setShowPreview(false)}
        />
      )}
    </main>
  );
}

// ─── FocusedTaskView ─────────────────────────────────────────────────────────

function FocusedTaskView({
  task,
  goal,
  onApprove,
  onOpenFeedback,
  onRetry,
  onStart,
  onSwitchDraft,
  feedbackOpen,
  feedbackDraft,
  onFeedbackChange,
  onFeedbackCancel,
  onFeedbackSubmit,
}: {
  task: Task;
  goal: Goal;
  onApprove: () => void;
  onOpenFeedback: () => void;
  onRetry: () => void;
  onStart: () => void;
  onSwitchDraft: (idx: number) => void;
  feedbackOpen: boolean;
  feedbackDraft: string;
  onFeedbackChange: (s: string) => void;
  onFeedbackCancel: () => void;
  onFeedbackSubmit: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const currentDraft = task.drafts[task.viewingIdx] ?? null;

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (currentDraft?.streaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [currentDraft?.content, currentDraft?.streaming]);

  const hasDraft = !!currentDraft && currentDraft.content.length > 0;
  const isStreaming = currentDraft?.streaming ?? false;
  const canReview =
    task.status === "awaiting-review" && hasDraft && !isStreaming;
  const canRetry =
    (task.status === "awaiting-review" || task.status === "approved") &&
    hasDraft &&
    !isStreaming;

  return (
    <>
      {/* Sub-header */}
      <div className="border-b border-border px-6 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <StatusPill status={task.status} />
              {task.drafts.length > 1 && (
                <span className="font-mono text-[10px] text-fg-2">
                  試行 {task.viewingIdx + 1}/{task.drafts.length}
                </span>
              )}
              {isStreaming && (
                <span className="relative flex-1 h-[2px] scan-bar bg-transparent" />
              )}
            </div>
            <h2 className="text-lg font-medium leading-snug text-fg-0">
              {task.label}
            </h2>
            <p className="text-sm leading-relaxed text-fg-1">
              {task.description}
            </p>
          </div>

          {task.drafts.length > 1 && (
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                disabled={task.viewingIdx === 0}
                onClick={() => onSwitchDraft(Math.max(0, task.viewingIdx - 1))}
                className="rounded border border-border p-1.5 text-fg-1 transition hover:border-fg-2 hover:text-fg-0 disabled:opacity-30"
              >
                <IconArrow dir="left" />
              </button>
              <button
                disabled={task.viewingIdx >= task.drafts.length - 1}
                onClick={() =>
                  onSwitchDraft(
                    Math.min(task.drafts.length - 1, task.viewingIdx + 1)
                  )
                }
                className="rounded border border-border p-1.5 text-fg-1 transition hover:border-fg-2 hover:text-fg-0 disabled:opacity-30"
              >
                <IconArrow dir="right" />
              </button>
            </div>
          )}
        </div>

        {/* Prior feedback */}
        {currentDraft?.feedback && (
          <div className="mt-3 rounded border border-warn/30 bg-warn/5 px-3 py-2">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-warn">
              受け取ったフィードバック
            </p>
            <p className="text-xs leading-relaxed text-fg-1">
              {currentDraft.feedback}
            </p>
          </div>
        )}
      </div>

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-6">
        {hasDraft ? (
          <div
            className={`prose-draft mx-auto max-w-3xl text-[15px] ${
              isStreaming ? "stream-cursor" : ""
            }`}
          >
            {currentDraft!.content}
          </div>
        ) : task.status === "queued" ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-fg-1">
              このタスクはまだ着手されていません。
            </p>
            <button
              onClick={onStart}
              className="rounded-md border border-accent bg-accent/10 px-4 py-2 text-sm text-fg-0 transition hover:bg-accent/20"
            >
              ▶ ドラフトを開始
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-fg-0 border-t-transparent" />
            <p className="text-sm text-fg-2">AI起筆中...</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-border bg-bg-1 px-6 py-3.5">
        {feedbackOpen ? (
          <div className="space-y-3">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-fg-2">
              修正指示 — 何を変えたいですか?
            </label>
            <textarea
              autoFocus
              value={feedbackDraft}
              onChange={(e) => onFeedbackChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onFeedbackSubmit();
                if (e.key === "Escape") onFeedbackCancel();
              }}
              rows={3}
              placeholder="例: もっとカジュアルなトーンに。冒頭の1文を刺さる問いに変えて。"
              className="w-full resize-none rounded-md border border-border bg-bg-0 px-3 py-2.5 text-sm text-fg-0 placeholder-fg-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-fg-2">
                ⌘↵ で送信 · Esc でキャンセル
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onFeedbackCancel}
                  className="rounded border border-border px-3 py-1.5 text-xs text-fg-1 transition hover:text-fg-0"
                >
                  キャンセル
                </button>
                <button
                  onClick={onFeedbackSubmit}
                  disabled={!feedbackDraft.trim()}
                  className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-xs text-fg-0 transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  改訂を依頼
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-fg-2">
              {task.status === "approved" ? (
                <span className="text-success">✓ 承認済み</span>
              ) : task.status === "awaiting-review" ? (
                <span>次のアクションを選んでください</span>
              ) : isStreaming ? (
                <span>ストリーミング中は操作を待ってください</span>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={!canRetry}
                onClick={onRetry}
                title="別のアプローチで書き直す"
                className="rounded border border-border px-3 py-1.5 text-xs text-fg-1 transition hover:border-border-strong hover:text-fg-0 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↻ 書き直し
              </button>
              <button
                disabled={!canReview}
                onClick={onOpenFeedback}
                className="rounded border border-warn/40 bg-warn/5 px-3 py-1.5 text-xs text-warn transition hover:bg-warn/15 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ✎ 修正指示
              </button>
              <button
                disabled={!canReview}
                onClick={onApprove}
                className="rounded border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success transition hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ✓ 承認
              </button>
            </div>
          </div>
        )}
      </div>

      {/* silence unused var warning for goal (kept for future use) */}
      {false && <span>{goal.id}</span>}
    </>
  );
}

// ─── ActivityLog ─────────────────────────────────────────────────────────────

const KIND_META: Record<ActivityKind, { color: string; label: string }> = {
  breakdown: { color: "text-cyan", label: "▶" },
  "draft-start": { color: "text-accent", label: "…" },
  "draft-complete": { color: "text-success", label: "✓" },
  "revise-start": { color: "text-warn", label: "…" },
  "revise-complete": { color: "text-success", label: "✓" },
  approve: { color: "text-success", label: "★" },
  error: { color: "text-danger", label: "!" },
};

function ActivityLog({ events }: { events: ActivityEvent[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3">
      <ul className="space-y-1.5 font-mono text-[11px] leading-relaxed">
        {events.map((e) => {
          const m = KIND_META[e.kind];
          const time = new Date(e.timestamp).toLocaleTimeString("ja-JP", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          return (
            <li key={e.id} className="flex items-start gap-2">
              <span className="w-16 flex-shrink-0 text-fg-2">{time}</span>
              <span className={`w-4 flex-shrink-0 ${m.color}`}>{m.label}</span>
              <span className={`flex-1 ${e.kind === "error" ? "text-danger" : "text-fg-1"}`}>
                {e.message}
              </span>
            </li>
          );
        })}
        {events.length === 0 && (
          <li className="text-fg-2">まだ活動はありません</li>
        )}
      </ul>
    </div>
  );
}

// ─── PreviewOverlay ──────────────────────────────────────────────────────────

function PreviewOverlay({
  goal,
  onClose,
}: {
  goal: Goal;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"none" | "plain" | "markdown">("none");

  const approvedCount = goal.tasks.filter((t) => t.status === "approved").length;
  const hasAny = goal.tasks.some((t) => t.drafts.length > 0);

  const stitchPlain = () => {
    return goal.tasks
      .map((t) => {
        const d = t.drafts[t.viewingIdx];
        if (!d || !d.content) return "";
        return d.content.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  };

  const stitchMarkdown = () => {
    return goal.tasks
      .map((t) => {
        const d = t.drafts[t.viewingIdx];
        if (!d || !d.content) return "";
        const tag = t.status === "approved" ? "" : "  _（未承認）_";
        return `## ${t.label}${tag}\n\n${d.content.trim()}`;
      })
      .filter(Boolean)
      .join("\n\n");
  };

  const doCopy = async (mode: "plain" | "markdown") => {
    const text = mode === "markdown" ? stitchMarkdown() : stitchPlain();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mode);
      setTimeout(() => setCopied("none"), 1600);
    } catch {
      /* ignore — clipboard permission denied */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-3xl flex-col border-x border-border bg-bg-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-2">
              全体プレビュー · {approvedCount}/{goal.tasks.length} 承認
            </p>
            <h2 className="mt-1 truncate text-sm font-medium text-fg-0">
              {goal.topic}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={!hasAny}
              onClick={() => doCopy("plain")}
              className="rounded border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-1 transition hover:border-border-strong hover:text-fg-0 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copied === "plain" ? "✓ コピー済" : "本文だけコピー"}
            </button>
            <button
              disabled={!hasAny}
              onClick={() => doCopy("markdown")}
              className="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copied === "markdown" ? "✓ コピー済" : "見出し付きコピー"}
            </button>
            <button
              onClick={onClose}
              className="rounded border border-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-1 hover:text-fg-0"
            >
              閉じる
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          {!hasAny ? (
            <div className="flex h-full items-center justify-center text-sm text-fg-2">
              まだドラフトがありません。
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-10">
              {goal.tasks.map((t, i) => {
                const d = t.drafts[t.viewingIdx];
                return (
                  <section key={t.id} className="space-y-3">
                    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
                      <h3 className="text-base font-semibold text-fg-0">
                        <span className="mr-2 font-mono text-xs text-fg-2">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {t.label}
                      </h3>
                      <StatusPill status={t.status} />
                    </div>
                    {d && d.content ? (
                      <div className="prose-draft text-[15px] text-fg-0">
                        {d.content}
                      </div>
                    ) : (
                      <p className="text-sm italic text-fg-2">
                        （まだドラフトなし）
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── HistoryOverlay ──────────────────────────────────────────────────────────

function HistoryOverlay({
  goals,
  currentId,
  onSelect,
  onDelete,
  onClose,
}: {
  goals: Goal[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-16 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-border bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-2">
            過去のゴール ({goals.length})
          </p>
          <button
            onClick={onClose}
            className="rounded border border-border px-2 py-0.5 text-xs text-fg-1 hover:text-fg-0"
          >
            閉じる
          </button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {goals.map((g) => {
            const approved = g.tasks.filter((t) => t.status === "approved").length;
            return (
              <li key={g.id} className="group flex items-center gap-2 rounded px-2">
                <button
                  onClick={() => onSelect(g.id)}
                  className={`flex flex-1 items-center justify-between gap-3 px-2 py-2.5 text-left transition ${
                    g.id === currentId ? "text-fg-0" : "text-fg-1 hover:text-fg-0"
                  }`}
                >
                  <span className="truncate text-sm">{g.topic}</span>
                  <span className="font-mono text-[10px] text-fg-2">
                    {approved}/{g.tasks.length}
                  </span>
                </button>
                <button
                  onClick={() => onDelete(g.id)}
                  className="rounded p-1 text-fg-2 opacity-0 transition group-hover:opacity-100 hover:text-danger"
                  title="削除"
                >
                  ✕
                </button>
              </li>
            );
          })}
          {goals.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-fg-2">
              履歴はまだありません
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
