"use client";

// ─── 6ステップ体験フロー ────────────────────────────────────────────────────
// 1 課題を書く → 2 AIが分解 → 3 合格ライン → 4 タスクを選ぶ → 5 集中 → 6 振り返り
// 各画面は「その時に必要な情報だけ」を持つ。ネムは毎ステップで表情とことばを変える。

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ensureNotifyPermission,
  fmtMinutes,
  judgeLoad,
  playComplete,
  playTap,
  passTarget,
  sendNotification,
  SAMPLE_KEYS,
  todayTasks,
  type Review,
  type Task,
  type TaskSet,
} from "./lib";
import { NemStage, type NemState } from "./nem";
import {
  HandCheck,
  HandUnderline,
  Heading,
  IndexCircle,
  InkButton,
  MinuteChip,
  PaperCard,
  PaperGauge,
  Portal,
  Stamp,
  BigCount,
} from "./ui";

type NightFlags = { isDeepNight: boolean; isPastMidnight: boolean };

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — 課題を書く
// ═══════════════════════════════════════════════════════════════════════════

export function StepInput({
  topic,
  setTopic,
  deadline,
  setDeadline,
  hasApiKey,
  loading,
  error,
  onBreakdown,
  onSample,
  onOpenSettings,
  night,
}: {
  topic: string;
  setTopic: (v: string) => void;
  deadline: string;
  setDeadline: (v: string) => void;
  hasApiKey: boolean;
  loading: boolean;
  error: string;
  onBreakdown: () => void;
  onSample: () => void;
  onOpenSettings: () => void;
  night: NightFlags;
}) {
  const [showDeadline, setShowDeadline] = useState(!!deadline);

  return (
    <div>
      <NemStage
        state={loading ? "ai-thinking" : topic.trim() ? "typing" : "step-input"}
        isDeepNight={night.isDeepNight}
        isPastMidnight={night.isPastMidnight}
        size={88}
        className="mb-3"
      />

      {/* 初見の人向けの補助文。入力欄やネムより目立たせない。 */}
      <p className="mb-5 text-center text-[11.5px] leading-relaxed text-ink-faint">
        AIが課題を分け、今日の終わりを先に決めます。
      </p>

      <PaperCard className="p-5">
        <label className="mb-2 block text-[13px] font-bold tracking-wide text-ink-soft">
          今日とりかかる課題
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
          maxLength={100}
          disabled={loading}
          placeholder="例）プレゼン資料を作る"
          className="ruled-input w-full text-[17px] font-medium placeholder:text-ink-faint"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-ink-faint">{topic.length}/100</span>
          <button
            onClick={() => setShowDeadline((v) => !v)}
            className="text-[11px] font-bold text-ink-soft underline decoration-dotted underline-offset-2"
          >
            {showDeadline ? "締め切りを隠す" : "締め切りを足す（任意）"}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {showDeadline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-bold text-ink-soft">締め切り</span>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="field hand-round-sm flex-1 px-2.5 py-1.5 text-sm"
                />
                {deadline && (
                  <button
                    onClick={() => setDeadline("")}
                    className="text-xs text-ink-faint"
                  >
                    ✕
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PaperCard>

      {/* お題の例 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {SAMPLE_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => {
              playTap();
              setTopic(k);
            }}
            className="pencil-dash hand-round-sm tap-shrink px-3 py-1.5 text-xs font-bold text-ink-soft"
          >
            {k}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 hand-round-sm bg-clay-2 px-3 py-2 text-xs font-bold text-clay">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-2.5">
        <InkButton
          onClick={onBreakdown}
          disabled={!topic.trim() || loading}
          className="w-full"
          glow={!!topic.trim() && !loading}
        >
          {loading ? "ネムが刻んでるよ…" : "AIに分解してもらう ✎"}
        </InkButton>
        <InkButton
          onClick={onSample}
          variant="paper"
          disabled={loading}
          className="w-full"
        >
          サンプルで試す（キー不要）
        </InkButton>
        {!hasApiKey && (
          <button
            onClick={onOpenSettings}
            className="w-full pt-1 text-[11px] text-ink-faint underline decoration-dotted"
          >
            AI分解を使うにはAPIキーを設定 →
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — AIが分解した結果
// ═══════════════════════════════════════════════════════════════════════════

export function StepBreakdown({
  set,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  onNext,
  night,
}: {
  set: TaskSet;
  onUpdateTask: (id: number, patch: Partial<Task>) => void;
  onDeleteTask: (id: number) => void;
  onAddTask: () => void;
  onNext: () => void;
  night: NightFlags;
}) {
  const total = set.tasks.reduce((s, t) => s + t.minutes, 0);

  return (
    <div>
      <NemStage
        state="after-breakdown"
        isDeepNight={night.isDeepNight}
        isPastMidnight={night.isPastMidnight}
        size={76}
        className="mb-5"
      />

      <Heading sub={`ぜんぶで ${fmtMinutes(total)}・タップで直せるよ`}>
        {set.tasks.length}個に分けたよ
      </Heading>

      <ul className="space-y-2.5">
        {set.tasks.map((t, i) => (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, y: 14, rotate: i % 2 ? 1.2 : -1.2 }}
            animate={{ opacity: 1, y: 0, rotate: i % 2 ? 0.5 : -0.5 }}
            transition={{
              delay: i * 0.09,
              type: "spring",
              stiffness: 320,
              damping: 26,
            }}
          >
            <EditableTaskRow
              task={t}
              index={i}
              onUpdate={(p) => onUpdateTask(t.id, p)}
              onDelete={() => onDeleteTask(t.id)}
            />
          </motion.li>
        ))}
      </ul>

      <button
        onClick={() => {
          playTap();
          onAddTask();
        }}
        className="pencil-dash hand-round-sm mt-3 w-full py-2.5 text-xs font-bold text-ink-faint"
      >
        ＋ タスクを足す
      </button>

      <InkButton
        onClick={onNext}
        disabled={set.tasks.length === 0}
        className="mt-6 w-full"
        glow
      >
        次へ：合格ラインを決める →
      </InkButton>
    </div>
  );
}

// 付箋風の編集できる行
function EditableTaskRow({
  task,
  index,
  onUpdate,
  onDelete,
}: {
  task: Task;
  index: number;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(task.label);
  const [min, setMin] = useState(String(task.minutes));
  const ref = useRef<HTMLInputElement>(null);

  function commit() {
    onUpdate({
      label: label.trim() || task.label,
      minutes: Math.max(1, Math.min(999, parseInt(min) || task.minutes)),
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="sticky-note hand-round-sm flex items-center gap-2 px-3 py-2.5">
        <input
          ref={ref}
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="field hand-round-sm min-w-0 flex-1 px-2 py-1 text-sm"
        />
        <input
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          type="number"
          min={1}
          max={999}
          className="field hand-round-sm w-14 px-1 py-1 text-center text-sm"
        />
        <InkButton size="sm" onClick={commit}>
          OK
        </InkButton>
      </div>
    );
  }

  return (
    <div className="sticky-note hand-round-sm flex items-center gap-2.5 px-3 py-3">
      <IndexCircle n={index + 1} />
      <button
        onClick={() => {
          setLabel(task.label);
          setMin(String(task.minutes));
          setEditing(true);
        }}
        className="min-w-0 flex-1 truncate text-left text-[14.5px] font-medium"
        title="タップして直す"
      >
        {task.label}
      </button>
      <MinuteChip minutes={task.minutes} />
      <button
        onClick={onDelete}
        aria-label="削除"
        className="tap-shrink flex-shrink-0 px-1 text-ink-faint hover:text-clay"
      >
        ✕
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — 今日の合格ラインを決める
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 現在時刻 ＋ 選択タスクの合計時間 だけの単純な見込み。
 * 休憩・中断は含まないので、あくまで目安として表示する。
 */
function estimateFinish(nowMs: number, minutes: number) {
  const now = new Date(nowMs);
  const end = new Date(nowMs + minutes * 60_000);
  const h = end.getHours();
  // 時は0埋めしない（「翌朝5:55」のように読ませたいため）
  const time = `${h}:${String(end.getMinutes()).padStart(2, "0")}`;
  const nextDay =
    end.getFullYear() !== now.getFullYear() ||
    end.getMonth() !== now.getMonth() ||
    end.getDate() !== now.getDate();
  // 0〜4時は「朝」と呼ばない（未明なので「翌1:20」と出す）
  return { time, nextDay, morning: h >= 5 && h < 12 };
}

export function StepPassLine({
  set,
  onDecide,
  night,
}: {
  set: TaskSet;
  onDecide: (count: number, label: string) => void;
  night: NightFlags;
}) {
  const totalTasks = set.tasks.length;
  const [count, setCount] = useState(
    Math.min(set.passCount ?? Math.max(1, Math.ceil(totalTasks * 0.6)), totalTasks)
  );
  const [stamping, setStamping] = useState(false);

  // 見込み時刻を出すための現在時刻。画面を開いたまま時間が経っても
  // ずれないよう、30秒ごとに更新する。
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const minutes = set.tasks.slice(0, count).reduce((s, t) => s + t.minutes, 0);
  const finish = estimateFinish(nowMs, minutes);
  const load = judgeLoad(minutes, night.isDeepNight);
  const nemState: NemState = load.level === "heavy" ? "passline-heavy" : "passline-ask";

  const tone = load.level === "heavy" ? "clay" : load.level === "fair" ? "moon" : "sage";

  function decide() {
    setStamping(true);
    playComplete();
    const label = `${totalTasks}個のうち ${count}個 終わらせる（${fmtMinutes(minutes)}）`;
    setTimeout(() => onDecide(count, label), 950);
  }

  return (
    <div className="relative">
      <NemStage
        state={nemState}
        isDeepNight={night.isDeepNight}
        isPastMidnight={night.isPastMidnight}
        size={80}
        className="mb-5"
      />

      <Heading sub="全部やらなくていい。ここまでやれたら今日は合格。">
        今日はどこまで？
      </Heading>

      <PaperCard className="px-5 py-6 text-center">
        <BigCount value={count} total={totalTasks} />
        <p className="mt-1 text-[11px] font-bold tracking-widest text-ink-faint">
          タスク
        </p>

        {/* − ドット +  */}
        <div className="mt-6 flex items-center justify-center gap-4">
          <StepperButton
            label="−"
            disabled={count <= 1}
            onClick={() => setCount((c) => Math.max(1, c - 1))}
          />
          <div className="flex items-center gap-2">
            {Array.from({ length: totalTasks }, (_, i) => (
              <button
                key={i}
                aria-label={`${i + 1}個にする`}
                onClick={() => {
                  playTap();
                  setCount(i + 1);
                }}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i + 1 <= count ? 13 : 9,
                  height: i + 1 <= count ? 13 : 9,
                  background:
                    i + 1 <= count ? "var(--color-moon)" : "transparent",
                  border:
                    i + 1 <= count
                      ? "1.5px solid var(--color-moon-deep)"
                      : "1.5px solid var(--pencil-strong)",
                }}
              />
            ))}
          </div>
          <StepperButton
            label="＋"
            disabled={count >= totalTasks}
            onClick={() => setCount((c) => Math.min(totalTasks, c + 1))}
          />
        </div>

        {/* 合計時間と重さの判定 */}
        <div className="mt-7">
          <div className="mb-2 flex items-baseline justify-center gap-2">
            <span className="text-[11px] font-bold text-ink-soft">かかる時間</span>
            <motion.span
              key={minutes}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-mono text-xl font-bold tabular-nums"
            >
              {fmtMinutes(minutes)}
            </motion.span>
          </div>

          {/* 終了見込み（現在時刻＋合計時間の単純な目安） */}
          <div className="mb-3">
            {finish.nextDay ? (
              <p className="text-[12.5px] font-bold leading-relaxed text-clay">
                終了見込み：翌{finish.morning ? "朝" : ""}
                <span className="font-mono">{finish.time}</span>
                <br />
                <span className="font-normal">明日の集中に影響しそう</span>
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed">
                予定時間ベースなら、
                <span className="marker font-mono font-bold">
                  {finish.time}ごろ
                </span>
                終了
              </p>
            )}
            <p className="mt-0.5 text-[10.5px] text-ink-faint">
              休憩を含まない目安です
            </p>
          </div>

          <PaperGauge value={count} max={totalTasks} tone={tone} />
          <p
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold"
            style={{
              color:
                load.level === "heavy"
                  ? "#C4694E"
                  : load.level === "fair"
                  ? "#B98D2C"
                  : "#6E8F72",
            }}
          >
            {load.level === "heavy" ? "⚠" : "○"} {load.label}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{load.hint}</p>
        </div>
      </PaperCard>

      {/* 対象タスクのプレビュー */}
      <div className="mt-4 space-y-1.5">
        {set.tasks.map((t, i) => {
          const inside = i < count;
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 px-1 text-[13px] transition-all duration-300"
              style={{ opacity: inside ? 1 : 0.32 }}
            >
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{
                  background: inside ? "var(--color-moon)" : "var(--pencil-strong)",
                }}
              />
              <span className={`min-w-0 flex-1 truncate ${inside ? "font-medium" : ""}`}>
                {t.label}
              </span>
              <span className="flex-shrink-0 font-mono text-[11px] text-ink-faint">
                {t.minutes}分
              </span>
            </div>
          );
        })}
        <p className="pt-1 text-center text-[11px] text-ink-faint">
          ここから下は、明日のきみに回してOK
        </p>
      </div>

      <InkButton onClick={decide} className="mt-6 w-full" glow disabled={stamping}>
        この目標で決定 🖋
      </InkButton>

      {/* 決定スタンプ（body 直下に出す） */}
      {stamping && (
        <Portal>
          <div
            className="fade-in fixed inset-0 z-[80] flex items-center justify-center"
            style={{ background: "rgba(20,26,46,0.45)", backdropFilter: "blur(2px)" }}
          >
            {/* 紙に判を押した見え方にする */}
            <div
              className="hand-round flex flex-col items-center gap-3 px-9 py-8"
              style={{
                background: "#FBF7EC",
                border: "1.5px solid rgba(34,48,76,0.18)",
                boxShadow: "0 24px 50px -20px rgba(0,0,0,0.6)",
              }}
            >
              <Stamp text="合格ライン" sub="DECIDED" tone="sage" size="lg" />
              <p className="text-[13px] font-bold text-[#22304C]">
                今日は {count} タスクで合格
              </p>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

function StepperButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => {
        if (disabled) return;
        playTap();
        onClick();
      }}
      disabled={disabled}
      className="btn-paper flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold disabled:opacity-25"
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 — 取り組むタスクを選ぶ
// ═══════════════════════════════════════════════════════════════════════════

export function StepSelect({
  set,
  selectedId,
  onSelect,
  onToggleDone,
  onStart,
  onAllDone,
  night,
}: {
  set: TaskSet;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onToggleDone: (id: number) => void;
  onStart: () => void;
  onAllDone: () => void;
  night: NightFlags;
}) {
  const list = todayTasks(set);
  const doneCount = list.filter((t) => t.done).length;
  const passCount = passTarget(set);
  const reached = doneCount >= passCount;
  const remainMin = list.filter((t) => !t.done).reduce((s, t) => s + t.minutes, 0);
  const selected = list.find((t) => t.id === selectedId && !t.done) ?? null;

  const nemState: NemState = reached
    ? "goal-reached"
    : selected
    ? "task-chosen"
    : "select-ask";

  return (
    <div>
      <NemStage
        state={nemState}
        isDeepNight={night.isDeepNight}
        isPastMidnight={night.isPastMidnight}
        size={76}
        className="mb-5"
      />

      {/* 今日の合格ライン（常に見える） */}
      <PaperCard className="mb-5 px-4 py-3.5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-bold tracking-wider text-ink-soft">
            今日の合格ライン
          </span>
          <span className="font-mono text-sm font-bold tabular-nums">
            {doneCount} / {passCount}
            <span className="ml-1 text-[11px] font-normal text-ink-faint">タスク</span>
          </span>
        </div>
        <PaperGauge value={doneCount} max={passCount} tone={reached ? "sage" : "moon"} />
        <p className="mt-2 text-[11px] text-ink-faint">
          {reached ? "合格ライン達成！ もう終わっていいよ" : `のこり ${fmtMinutes(remainMin)}`}
        </p>
      </PaperCard>

      <Heading underline={false}>
        {reached ? "今日はここまでで十分" : "どれから始める？"}
      </Heading>

      <ul className="space-y-3">
        {list.map((t, i) => (
          <SelectableTask
            key={t.id}
            task={t}
            index={i}
            selected={t.id === selectedId}
            onSelect={() => onSelect(t.id)}
            onToggleDone={() => onToggleDone(t.id)}
          />
        ))}
      </ul>

      {/* 合格ライン外（明日ぶん）を薄く見せる */}
      {set.tasks.length > list.length && (
        <div className="mt-5 opacity-45">
          <p className="mb-2 text-[11px] font-bold tracking-wider text-ink-faint">
            明日にまわしたぶん
          </p>
          <ul className="space-y-1">
            {set.tasks.slice(list.length).map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 px-1 text-[12.5px] text-ink-soft"
              >
                <span className="h-1 w-1 rounded-full bg-current opacity-50" />
                <span className="min-w-0 flex-1 truncate">{t.label}</span>
                <span className="font-mono text-[11px]">{t.minutes}分</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-7 space-y-2.5">
        {/* 今日ぶんが全部終わったら、集中ボタンは出さない */}
        {list.some((t) => !t.done) && (
          <InkButton
            onClick={onStart}
            disabled={!selected}
            className="w-full"
            glow={!!selected}
          >
            {selected
              ? `⚡ 「${trunc(selected.label, 12)}」に集中する`
              : "タスクをひとつ選んで"}
          </InkButton>
        )}
        {reached && (
          <InkButton onClick={onAllDone} variant="moon" className="w-full" glow>
            今日を振り返って終える →
          </InkButton>
        )}
      </div>
    </div>
  );
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function SelectableTask({
  task,
  index,
  selected,
  onSelect,
  onToggleDone,
}: {
  task: Task;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onToggleDone: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: task.done ? 0.55 : 1,
        y: selected ? -4 : 0,
        scale: selected ? 1.02 : 1,
      }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="hand-round-sm relative"
      style={{
        boxShadow: selected
          ? "0 10px 22px -12px rgba(34,48,76,0.55), 0 0 0 2px var(--color-moon)"
          : undefined,
      }}
    >
      <div
        className={`sticky-note hand-round-sm flex items-center gap-3 px-3.5 py-4 ${
          task.done ? "" : "cursor-pointer"
        }`}
        onClick={() => {
          if (task.done) return;
          playTap();
          onSelect();
        }}
      >
        {/* 完了チェック */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!task.done) playComplete();
            else playTap();
            onToggleDone();
          }}
          aria-label="完了にする"
          className="tap-shrink flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            border: task.done
              ? "2px solid #6E8F72"
              : "2px solid var(--pencil-strong)",
            background: task.done ? "rgba(110,143,114,0.14)" : "transparent",
          }}
        >
          {task.done && <HandCheck size={17} />}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[15px] font-medium ${
              task.done ? "line-through opacity-60" : ""
            }`}
          >
            {task.label}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {index + 1}番目・{task.minutes}分
          </p>
        </div>

        {selected && !task.done && (
          <span className="flex-shrink-0 text-[11px] font-bold text-moon-deep">
            選択中
          </span>
        )}
      </div>
    </motion.li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5 — 集中する
// ═══════════════════════════════════════════════════════════════════════════

export function StepFocus({
  task,
  onComplete,
  onPostpone,
  onBack,
  night,
}: {
  task: Task;
  onComplete: () => void;
  /** 明日に回す（タスクは未完了のまま集中を終える） */
  onPostpone: () => void;
  onBack: () => void;
  night: NightFlags;
}) {
  const totalSec = task.minutes * 60;
  const [seconds, setSeconds] = useState(totalSec);
  const [overtime, setOvertime] = useState(0);
  const [running, setRunning] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [extendCount, setExtendCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const notified = useRef({ end: false, m15: false, m30: false });
  // running は state なので、await をまたぐ連打では古い値が見える。
  // 同期的に読める ref で二重起動を止める。
  const runningRef = useRef(false);

  // タスクが変わったときのリセットは、呼び出し側が key={task.id} で
  // この要素を作り直すことで行う（effect内のsetStateを避ける）。

  const startInterval = useCallback(() => {
    // 必ず既存を止めてから張る。連打や再入で interval が増殖すると
    // タイマーが倍速になり、解放されないものが残る。
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      const elapsed = elapsedRef.current;
      if (elapsed <= totalSec) {
        setSeconds(totalSec - elapsed);
        if (elapsed === totalSec) {
          setIsOver(true);
          if (!notified.current.end) {
            notified.current.end = true;
            sendNotification("⏰ 時間です", `「${task.label}」の予定時間が終わりました`);
          }
        }
      } else {
        const over = elapsed - totalSec;
        setOvertime(over);
        if (over === 15 * 60 && !notified.current.m15) {
          notified.current.m15 = true;
          sendNotification("⚠️ +15分オーバー", "肩の力、抜いてみて");
        }
        if (over === 30 * 60 && !notified.current.m30) {
          notified.current.m30 = true;
          sendNotification("😴 +30分オーバー", "もう寝よ？");
        }
      }
    }, 1000);
  }, [totalSec, task.label]);

  // 集中画面を離れたら interval を確実に解放する
  useEffect(() => {
    const iv = intervalRef;
    const rn = runningRef;
    return () => {
      rn.current = false;
      if (iv.current) {
        clearInterval(iv.current);
        iv.current = null;
      }
    };
  }, []);

  async function toggle() {
    playTap();
    if (runningRef.current) {
      runningRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setRunning(false);
      return;
    }
    runningRef.current = true;
    setRunning(true);
    await ensureNotifyPermission();
    // 待っている間に停止された場合は張らない
    if (!runningRef.current) return;
    startInterval();
  }

  function extend(min: number) {
    playTap();
    elapsedRef.current = Math.max(0, totalSec - min * 60);
    notified.current = { end: false, m15: false, m30: false };
    setIsOver(false);
    setOvertime(0);
    setSeconds(min * 60);
    setExtendCount((c) => c + 1);
    runningRef.current = true;
    setRunning(true);
    startInterval(); // 内部で既存を止めるので二重にならない
  }

  const overMin = Math.floor(overtime / 60);
  const nemState: NemState = isOver
    ? overMin >= 30
      ? "overtime-30"
      : overMin >= 15
      ? "overtime-15"
      : "overtime-reflect"
    : running
    ? "focus-watching"
    : "focus-standby";

  const pct = isOver ? 1 : 1 - seconds / totalSec;
  const r = 76;
  const circ = 2 * Math.PI * r;
  const mm = Math.floor((isOver ? overtime : seconds) / 60);
  const ss = (isOver ? overtime : seconds) % 60;

  const ring = isOver ? "#C4694E" : "#E9B94C";

  return (
    <div className="focus-enter">
      {/* 集中モードの盤面：常に夜の色 */}
      <div
        className={`hand-round-lg relative overflow-hidden px-5 pb-6 pt-5 ${
          isOver ? "over-pulse" : running ? "focus-pulse" : ""
        }`}
        style={{
          background: "linear-gradient(170deg, #1b2440 0%, #131a2e 100%)",
          border: "1.5px solid rgba(226,232,245,0.14)",
          color: "#e6eaf5",
        }}
      >
        {/* 星 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(1.4px 1.4px at 14% 12%, rgba(255,255,255,.5) 50%, transparent 51%), radial-gradient(1.2px 1.2px at 76% 9%, rgba(255,255,255,.4) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 88% 34%, rgba(255,255,255,.35) 50%, transparent 51%), radial-gradient(1.1px 1.1px at 30% 6%, rgba(255,255,255,.3) 50%, transparent 51%)",
          }}
        />

        <div className="relative">
          <div className="mb-1 flex items-center justify-between">
            <button
              onClick={onBack}
              className="text-[11px] font-bold text-[#8fa0c4] hover:text-white"
            >
              ← タスク一覧
            </button>
            <span
              className="text-[11px] font-bold tracking-[0.18em]"
              style={{ color: isOver ? "#E8A98F" : "#E9B94C" }}
            >
              {isOver ? "超過中" : running ? "集中中" : "スタンバイ"}
            </span>
          </div>

          <p className="mb-5 text-center text-[15px] font-bold leading-snug">
            {task.label}
          </p>

          {/* 円タイマー */}
          <div className="mb-5 flex justify-center">
            <div className="relative h-56 w-56">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 180 180">
                {/* 外側の手描き風の破線 */}
                <circle
                  cx="90"
                  cy="90"
                  r={r + 9}
                  fill="none"
                  stroke="rgba(226,232,245,0.16)"
                  strokeWidth="1.5"
                  strokeDasharray="3 6"
                />
                <circle
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  stroke="rgba(226,232,245,0.13)"
                  strokeWidth="9"
                />
                <circle
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  stroke={ring}
                  strokeWidth="9"
                  strokeDasharray={circ}
                  strokeDashoffset={isOver ? 0 : circ * (1 - pct)}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.4s" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isOver && (
                  <span className="mb-1 text-[11px] font-bold tracking-widest text-[#E8A98F]">
                    超過
                  </span>
                )}
                <span
                  className="font-mono text-[54px] font-bold leading-none tabular-nums"
                  style={{ color: isOver ? "#E8A98F" : "#f4eee0" }}
                >
                  {isOver && "+"}
                  {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                </span>
                {!isOver && (
                  <span className="mt-2 text-[11px] tracking-wider text-[#8fa0c4]">
                    予定 {task.minutes}分
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ネムは静かに見守る */}
          <div className="mb-5">
            <NemStage
              state={nemState}
              isDeepNight={night.isDeepNight}
              isPastMidnight={night.isPastMidnight}
              size={58}
              quiet
              tone="night"
            />
          </div>

          {/* 超過時：強制終了ではなく、続ける理由を選ばせる */}
          <AnimatePresence>
            {isOver && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div
                  className="hand-round-sm px-3.5 py-3"
                  style={{
                    background: "rgba(196,105,78,0.14)",
                    border: "1.5px solid rgba(196,105,78,0.4)",
                  }}
                >
                  <p className="mb-1 text-[12px] font-bold text-[#F0C4B2]">
                    どうする？ 決めるのはきみだよ
                  </p>
                  <p className="mb-3 text-[11px] leading-relaxed text-[#b9c4dd]">
                    {night.isPastMidnight
                      ? "もう日付が変わってる。ここで寝ると、明日の集中がもつよ。"
                      : night.isDeepNight
                      ? `いま+5分のばすと、寝るのが${5 * (extendCount + 1)}分おそくなる。明日にひびくかも。`
                      : `のばしたぶん、あとの予定が${5 * (extendCount + 1)}分ずれるよ。`}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => extend(5)}
                      className="hand-round-sm px-3 py-2.5 text-left text-[12.5px] font-bold"
                      style={{
                        background: "rgba(226,232,245,0.08)",
                        border: "1.5px solid rgba(226,232,245,0.2)",
                        color: "#e6eaf5",
                      }}
                    >
                      あと5分で区切れそう
                      <span className="ml-1 font-normal text-[#8fa0c4]">
                        （+5分だけ）
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        playTap();
                        onPostpone();
                      }}
                      className="hand-round-sm px-3 py-2.5 text-left text-[12.5px] font-bold"
                      style={{
                        background: "rgba(233,185,76,0.16)",
                        border: "1.5px solid rgba(233,185,76,0.45)",
                        color: "#F6DFA0",
                      }}
                    >
                      今日はここまでにする
                      <span className="ml-1 font-normal opacity-70">
                        （明日の自分にわたす）
                      </span>
                    </button>
                  </div>
                  {extendCount >= 2 && (
                    <p className="mt-2.5 text-[11px] font-bold text-[#F0C4B2]">
                      もう{extendCount}回のばしてるよ。ほんとに、もう十分。
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 操作 */}
          <div className="grid grid-cols-5 gap-2">
            <button
              onClick={toggle}
              className="hand-round-sm col-span-3 py-3.5 text-sm font-bold"
              style={{
                background: running ? "rgba(226,232,245,0.1)" : "#E9B94C",
                border: running
                  ? "1.5px solid rgba(226,232,245,0.25)"
                  : "1.5px solid #B98D2C",
                color: running ? "#e6eaf5" : "#2a1f06",
                boxShadow: running ? "none" : "3px 3px 0 0 rgba(0,0,0,0.35)",
              }}
            >
              {running ? "⏸ 一時停止" : "▶ はじめる"}
            </button>
            <button
              onClick={() => {
                playComplete();
                onComplete();
              }}
              className="hand-round-sm col-span-2 py-3.5 text-sm font-bold"
              style={{
                background: "rgba(110,143,114,0.9)",
                border: "1.5px solid #557a5b",
                color: "#f2f7f1",
                boxShadow: "3px 3px 0 0 rgba(0,0,0,0.35)",
              }}
            >
              ✓ できた
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6 — 振り返り
// ═══════════════════════════════════════════════════════════════════════════

export function StepReview({
  set,
  onSave,
  onFinish,
  onResume,
  night,
}: {
  set: TaskSet;
  onSave: (r: Review) => void;
  onFinish: () => void;
  onResume: () => void;
  night: NightFlags;
}) {
  const list = todayTasks(set);
  const passCount = passTarget(set);
  const doneCount = list.filter((t) => t.done).length;
  const doneMin = list.filter((t) => t.done).reduce((s, t) => s + t.minutes, 0);
  const achieved = doneCount >= passCount;
  const saved = set.review;

  // 明日への引き継ぎ。保存済みタスクを見るだけで、予定は作らない。
  const remaining = set.tasks.filter((t) => !t.done);

  const [memo, setMemo] = useState(saved?.memo ?? "");

  const nemState: NemState = saved
    ? saved.achieved
      ? "review-yes"
      : "review-no"
    : achieved
    ? "goal-reached"
    : "review-ask";

  function save() {
    onSave({ at: Date.now(), achieved, memo: memo.trim() });
  }

  return (
    <div>
      <NemStage
        state={nemState}
        isDeepNight={night.isDeepNight}
        isPastMidnight={night.isPastMidnight}
        size={82}
        className="mb-5"
      />

      <Heading sub={new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}>
        おつかれさま
      </Heading>

      <PaperCard className="px-5 py-6">
        {/* 合格ラインと結果 */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wider text-ink-soft">
              決めた合格ライン
            </p>
            <p className="mt-1 text-[14px] font-bold leading-snug">
              {passCount}タスク
              <span className="ml-1 text-[12px] font-normal text-ink-soft">
                / 全{set.tasks.length}
              </span>
            </p>
            <p className="mt-3 text-[11px] font-bold tracking-wider text-ink-soft">
              できたこと
            </p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums">
              {doneCount}
              <span className="ml-1 text-base font-normal text-ink-faint">
                / {passCount}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">
              作業時間 {fmtMinutes(doneMin)}
            </p>
          </div>
          <div className="flex-shrink-0">
            {achieved ? (
              <Stamp text="合格" sub="WELL DONE" tone="sage" />
            ) : (
              <Stamp text="ここまで" sub="TO BE CONT." tone="moon" />
            )}
          </div>
        </div>

        <div className="pencil-line my-5" />

        {/* 今日やったことの一覧 */}
        <ul className="space-y-1.5">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-[13px]">
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                {t.done ? (
                  <HandCheck size={16} />
                ) : (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ border: "1.5px solid var(--pencil-strong)" }}
                  />
                )}
              </span>
              <span className={`min-w-0 flex-1 truncate ${t.done ? "" : "opacity-50"}`}>
                {t.label}
              </span>
            </li>
          ))}
        </ul>

        {!achieved && (
          <p className="mt-4 hand-round-sm bg-moon-2/40 px-3 py-2 text-[12px] leading-relaxed">
            届かなかった日もあるよ。ここまで来たのは、ほんとのこと。
          </p>
        )}
      </PaperCard>

      {/* 明日への引き継ぎ（保存済みタスクを見るだけ） */}
      <div
        className="hand-round-sm mt-4 px-4 py-3"
        style={{ border: "1.5px dashed var(--pencil-strong)" }}
      >
        <p className="text-[11px] font-bold tracking-wider text-ink-soft">
          明日への引き継ぎ
        </p>
        {remaining.length > 0 ? (
          <p className="mt-1.5 text-[13px] leading-relaxed">
            残り{remaining.length}タスクは、そのまま明日に残しておいたよ。
            <br />
            明日は「
            <span className="marker font-bold">{remaining[0].label}</span>
            」から始めよう。
          </p>
        ) : (
          <p className="mt-1.5 text-[13px] leading-relaxed">
            すべて完了。明日は新しい課題から始められるよ。
          </p>
        )}
      </div>

      {/* メモ */}
      <div className="mt-4">
        <label className="mb-1.5 block text-[12px] font-bold text-ink-soft">
          ひとことメモ（任意）
        </label>
        {saved ? (
          <p className="paper hand-round-sm min-h-12 whitespace-pre-wrap px-3.5 py-2.5 text-[13px]">
            {saved.memo || <span className="text-ink-faint">（なし）</span>}
          </p>
        ) : (
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="明日の自分へ、ひとこと"
            className="field hand-round-sm w-full px-3.5 py-2.5 text-[13px]"
          />
        )}
      </div>

      <div className="mt-6 space-y-2.5">
        {!saved ? (
          <InkButton onClick={save} className="w-full" glow>
            記録して、今日を終える 🌙
          </InkButton>
        ) : (
          <>
            <InkButton onClick={onFinish} className="w-full">
              新しい課題をはじめる
            </InkButton>
            <InkButton onClick={onResume} variant="paper" className="w-full">
              まだ続ける（タスク一覧へ）
            </InkButton>
          </>
        )}
      </div>

      {saved && (
        <div className="mt-6 flex justify-center">
          <HandUnderline width={140} color="var(--pencil-strong)" thickness={2} />
        </div>
      )}
    </div>
  );
}
