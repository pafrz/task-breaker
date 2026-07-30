"use client";

// ─── Task Breaker — ステップルーター ────────────────────────────────────────
// 縦スクロールの1画面ではなく、6段階の場面転換として体験させる。
// 状態はここに集約し、各ステップ画面(flow.tsx)は表示と入力だけを担う。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  API_KEY_STORAGE,
  deriveStep,
  FOCUS_TASK_STORAGE,
  genId,
  isDeepNight,
  isPastMidnight,
  loadStorage,
  pickSample,
  playFanfare,
  playTap,
  saveStorage,
  todayTasks,
  type Priority,
  type Review,
  type Step,
  type Task,
  type TaskSet,
} from "./lib";
import {
  StepBreakdown,
  StepFocus,
  StepInput,
  StepPassLine,
  StepReview,
  StepSelect,
} from "./flow";
import { LogSheet, SettingsSheet } from "./parts";
import { Nem } from "./nem";
import { InkButton, PaperScraps, Portal, StepRail } from "./ui";

const STEP_STORAGE = "task-breaker-step-v1";

export default function Home() {
  // ─── 基本状態 ──────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  const [taskSets, setTaskSets] = useState<TaskSet[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);

  // ─── フロー ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);
  const [maxStep, setMaxStep] = useState<Step>(1);
  const [dir, setDir] = useState<1 | -1>(1);

  // ─── ステップ1の下書き ─────────────────────────────────────────────────
  const [draftTopic, setDraftTopic] = useState("");
  const [draftDeadline, setDraftDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ─── オーバーレイ ──────────────────────────────────────────────────────
  const [sheet, setSheet] = useState<null | "log" | "settings">(null);
  const [celebrate, setCelebrate] = useState(false);
  const [showNightVeil, setShowNightVeil] = useState(false);

  // ─── 深夜判定 ──────────────────────────────────────────────────────────
  const [now, setNow] = useState<Date>(() => new Date());
  const deepNight = useMemo(() => isDeepNight(now), [now]);
  const pastMidnight = useMemo(() => isPastMidnight(now), [now]);
  const night = useMemo(
    () => ({ isDeepNight: deepNight, isPastMidnight: pastMidnight }),
    [deepNight, pastMidnight]
  );
  const prevNightRef = useRef<boolean | null>(null);
  const prevReachedRef = useRef(false);

  // ─── 復元 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = loadStorage();
    setTaskSets(stored.taskSets);
    setCurrentId(stored.currentId);
    setApiKey(localStorage.getItem(API_KEY_STORAGE) ?? "");
    const rawFocus = localStorage.getItem(FOCUS_TASK_STORAGE);
    setFocusTaskId(rawFocus ? parseInt(rawFocus) : null);

    const set = stored.taskSets.find((s) => s.id === stored.currentId) ?? null;
    const savedStep = parseInt(localStorage.getItem(STEP_STORAGE) ?? "0");
    const derived = deriveStep(set);
    // 保存されたステップが今のデータで成立するなら尊重する
    const restored: Step =
      savedStep >= 1 && savedStep <= 6 && set && savedStep !== 1
        ? (Math.min(savedStep, derived === 6 ? 6 : Math.max(derived, 4)) as Step)
        : derived;
    setStep(restored);
    setMaxStep(Math.max(restored, derived) as Step);
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
    if (focusTaskId !== null)
      localStorage.setItem(FOCUS_TASK_STORAGE, String(focusTaskId));
    else localStorage.removeItem(FOCUS_TASK_STORAGE);
  }, [focusTaskId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STEP_STORAGE, String(step));
  }, [step, mounted]);

  // 毎分、深夜かどうかを再判定
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // 夜モードを <html data-night> に反映（集中中は常に夜の盤面）
  useEffect(() => {
    if (typeof document === "undefined") return;
    const on = deepNight || step === 5;
    document.documentElement.dataset.night = on ? "true" : "false";
    // 夜に「入る」ときだけベールを出す。明るい画面に戻るときに
    // 暗幕が走ると目に痛いので、抜けるときは静かに戻す。
    if (prevNightRef.current === false && on) {
      setShowNightVeil(true);
      const t = setTimeout(() => setShowNightVeil(false), 1500);
      prevNightRef.current = on;
      return () => clearTimeout(t);
    }
    prevNightRef.current = on;
  }, [deepNight, step]);

  // ─── 派生値 ────────────────────────────────────────────────────────────
  const current = taskSets.find((s) => s.id === currentId) ?? null;
  const focusTask = current?.tasks.find((t) => t.id === focusTaskId) ?? null;
  const todayList = current ? todayTasks(current) : [];
  const passCount = current?.passCount ?? todayList.length;
  const doneCount = todayList.filter((t) => t.done).length;
  const goalReached = todayList.length > 0 && doneCount >= passCount;

  // 合格ライン到達の瞬間だけ祝う
  useEffect(() => {
    if (!mounted) return;
    if (!prevReachedRef.current && goalReached) {
      setCelebrate(true);
      playFanfare();
      const t = setTimeout(() => setCelebrate(false), 3600);
      prevReachedRef.current = true;
      return () => clearTimeout(t);
    }
    if (!goalReached) prevReachedRef.current = false;
  }, [goalReached, mounted]);

  // ─── 遷移ヘルパ ────────────────────────────────────────────────────────
  const stepRef = useRef<Step>(1);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const go = useCallback((next: Step) => {
    setDir(next >= stepRef.current ? 1 : -1);
    stepRef.current = next;
    setStep(next);
    setMaxStep((m) => (next > m ? next : m));
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  function updateCurrent(fn: (s: TaskSet) => TaskSet) {
    setTaskSets((prev) => prev.map((s) => (s.id === currentId ? fn(s) : s)));
  }

  function createSet(
    topic: string,
    tasks: { label: string; minutes: number }[],
    deadline: string
  ) {
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
    };
    setTaskSets((prev) => [newSet, ...prev.slice(0, 19)]);
    setCurrentId(newSet.id);
    setFocusTaskId(null);
    prevReachedRef.current = false;
    go(2);
  }

  // ─── ステップ1のアクション ─────────────────────────────────────────────
  async function handleBreakdown() {
    const topic = draftTopic.trim();
    if (!topic) return;
    if (!apiKey.trim()) {
      setError(
        "APIキーが未設定です。「サンプルで試す」でも全機能ためせます。"
      );
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      createSet(topic, data.tasks, draftDeadline);
    } catch (e: unknown) {
      setError((e as Error).message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function handleSample() {
    const picked = pickSample(draftTopic);
    const topic = draftTopic.trim() || picked.key;
    setDraftTopic(topic);
    setError("");
    createSet(topic, picked.tasks, draftDeadline);
  }

  // ─── タスク操作 ────────────────────────────────────────────────────────
  function updateTask(id: number, patch: Partial<Task>) {
    updateCurrent((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function deleteTask(id: number) {
    if (focusTaskId === id) setFocusTaskId(null);
    updateCurrent((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  }

  function addTask() {
    if (!current) return;
    const maxId = current.tasks.reduce((m, t) => Math.max(m, t.id), 0);
    updateCurrent((s) => ({
      ...s,
      tasks: [
        ...s.tasks,
        {
          id: maxId + 1,
          label: "新しいタスク",
          minutes: 15,
          done: false,
          priority: "medium",
          memo: "",
        },
      ],
    }));
  }

  function toggleTask(id: number) {
    updateCurrent((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  }

  // ─── ステップ遷移アクション ────────────────────────────────────────────
  function decidePassLine(count: number, label: string) {
    updateCurrent((s) => ({ ...s, passCount: count, passLine: label }));
    prevReachedRef.current = false;
    go(4);
  }

  function startFocus() {
    if (!focusTaskId) return;
    go(5);
  }

  function completeFocusTask() {
    if (!focusTask) return;
    toggleTask(focusTask.id);
    setFocusTaskId(null);
    go(4);
  }

  function postponeFocusTask() {
    setFocusTaskId(null);
    go(4);
  }

  function saveReview(r: Review) {
    updateCurrent((s) => ({ ...s, review: r }));
    playFanfare();
  }

  function startNewTopic() {
    setCurrentId(null);
    setFocusTaskId(null);
    setDraftTopic("");
    setDraftDeadline("");
    setError("");
    prevReachedRef.current = false;
    setMaxStep(1);
    go(1);
  }

  function resetProgress() {
    updateCurrent((s) => ({
      ...s,
      tasks: s.tasks.map((t) => ({ ...t, done: false })),
      review: undefined,
    }));
    setFocusTaskId(null);
    prevReachedRef.current = false;
    go(4);
  }

  function deleteSet(id: string) {
    setTaskSets((prev) => prev.filter((s) => s.id !== id));
    if (currentId === id) {
      setCurrentId(null);
      setFocusTaskId(null);
      setMaxStep(1);
      go(1);
    }
  }

  function openSet(id: string) {
    const s = taskSets.find((x) => x.id === id);
    if (!s) return;
    setCurrentId(id);
    setFocusTaskId(null);
    setSheet(null);
    prevReachedRef.current = false;
    const d = deriveStep(s);
    setMaxStep(d);
    go(d);
  }

  // レールから飛べるか
  function canGoTo(n: Step): boolean {
    if (n === 1) return true;
    if (!current) return false;
    if (n === 2 || n === 3) return current.tasks.length > 0;
    if (n === 4 || n === 6) return current.passCount !== undefined;
    if (n === 5) return !!focusTask;
    return false;
  }

  if (!mounted) return null;

  // ─── 描画 ──────────────────────────────────────────────────────────────
  const isFocusStep = step === 5;

  return (
    <main className="relative z-[1] min-h-screen">
      <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-4 sm:pt-6">
        {/* ── ヘッダー ── */}
        <header className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              playTap();
              if (current) go(canGoTo(4) ? 4 : 2);
              else go(1);
            }}
            className="flex items-center gap-2"
            title="ホーム"
          >
            <Nem expression={deepNight ? "sleepy" : "default"} size={34} floating={false} />
            <span className="text-[19px] font-bold tracking-tight">
              Task Breaker
            </span>
          </button>

          <div className="flex items-center gap-1">
            <IconBtn
              label="記録"
              onClick={() => setSheet("log")}
              badge={taskSets.length > 0 ? taskSets.length : undefined}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 5.5A2 2 0 016 3.5h9l5 5v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-15z M8 12h8M8 16h5"
              />
            </IconBtn>
            <IconBtn label="設定" onClick={() => setSheet("settings")}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M10.3 4.3c.4-1.7 2.9-1.7 3.3 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.3 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </IconBtn>
          </div>
        </header>

        {/* ── ステップレール（集中中は隠して没入させる） ── */}
        {!isFocusStep && (
          <div className="fade-in mb-6 pt-1">
            <StepRail
              current={step}
              maxReached={maxStep}
              onJump={(n) => {
                const t = n as Step;
                if (canGoTo(t)) go(t);
              }}
            />
          </div>
        )}

        {/* ── ステップ本体 ──
            key を変えて差し替えるだけの enter アニメーション。
            exit の完了待ちがないので、途中で固まる余地がない。 */}
        <div key={step} className={dir > 0 ? "step-enter-fwd" : "step-enter-back"}>
            {step === 1 && (
              <StepInput
                topic={draftTopic}
                setTopic={setDraftTopic}
                deadline={draftDeadline}
                setDeadline={setDraftDeadline}
                hasApiKey={!!apiKey.trim()}
                loading={loading}
                error={error}
                onBreakdown={handleBreakdown}
                onSample={handleSample}
                onOpenSettings={() => setSheet("settings")}
                night={night}
              />
            )}

            {step === 2 && current && (
              <StepBreakdown
                set={current}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                onAddTask={addTask}
                onNext={() => go(3)}
                night={night}
              />
            )}

            {step === 3 && current && (
              <StepPassLine set={current} onDecide={decidePassLine} night={night} />
            )}

            {step === 4 && current && (
              <StepSelect
                set={current}
                selectedId={focusTaskId}
                onSelect={setFocusTaskId}
                onToggleDone={toggleTask}
                onStart={startFocus}
                onAllDone={() => go(6)}
                night={night}
              />
            )}

            {step === 5 && focusTask && (
              <StepFocus
                key={focusTask.id}
                task={focusTask}
                onComplete={completeFocusTask}
                onPostpone={postponeFocusTask}
                onBack={() => go(4)}
                night={night}
              />
            )}

            {step === 6 && current && (
              <StepReview
                set={current}
                onSave={saveReview}
                onFinish={startNewTopic}
                onResume={() => go(4)}
                night={night}
              />
            )}

            {/* データ不整合時の受け皿 */}
            {((step >= 2 && step <= 4 && !current) ||
              (step === 5 && !focusTask) ||
              (step === 6 && !current)) && (
              <div className="paper hand-round px-5 py-8 text-center">
                <div className="mb-4 flex justify-center">
                  <Nem expression="default" size={78} />
                </div>
                <p className="mb-5 text-sm font-medium">
                  {step === 5
                    ? "集中するタスクが選ばれてないよ。"
                    : "まだ課題がないよ。最初の1つを書こう。"}
                </p>
                <InkButton onClick={() => go(step === 5 ? 4 : 1)} className="w-full">
                  {step === 5 ? "タスクを選ぶ" : "課題を書く"}
                </InkButton>
              </div>
            )}
        </div>

        {/* ── 現在の課題名（フローの文脈を常に見せる） ── */}
        {current && step >= 2 && step !== 5 && (
          <p className="mt-8 text-center text-[11px] text-ink-faint">
            いまの課題：<span className="marker font-bold">{current.topic}</span>
          </p>
        )}

        {/* ── 新しい課題へ ── */}
        {current && step >= 2 && step !== 5 && (
          <div className="mt-3 flex justify-center">
            <button
              onClick={() => {
                playTap();
                startNewTopic();
              }}
              className="text-[11px] text-ink-faint underline decoration-dotted underline-offset-2"
            >
              別の課題をはじめる
            </button>
          </div>
        )}
      </div>

      {/* ── 演出レイヤ（transform の影響を受けないよう body 直下へ） ── */}
      {celebrate && (
        <Portal>
          <PaperScraps />
        </Portal>
      )}
      {showNightVeil && (
        <Portal>
          <div className="night-veil" />
        </Portal>
      )}

      {/* ── シート ── */}
      <AnimatePresence>
        {sheet === "log" && (
          <LogSheet
            taskSets={taskSets}
            currentId={currentId}
            night={night}
            onOpen={openSet}
            onDelete={deleteSet}
            onResetProgress={resetProgress}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === "settings" && (
          <SettingsSheet
            apiKey={apiKey}
            setApiKey={setApiKey}
            night={night}
            onClose={() => setSheet(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

// ─── ヘッダーのアイコンボタン ───────────────────────────────────────────────

function IconBtn({
  children,
  label,
  onClick,
  badge,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={() => {
        playTap();
        onClick();
      }}
      title={label}
      aria-label={label}
      className="tap-shrink relative flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition hover:text-ink"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {children}
      </svg>
      {badge !== undefined && (
        <span
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
          style={{ background: "var(--color-moon)", color: "#2a1f06" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
