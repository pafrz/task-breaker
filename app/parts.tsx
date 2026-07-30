"use client";

// ─── 記録シート / 設定シート ────────────────────────────────────────────────
// フロー(6ステップ)の邪魔をしないよう、どちらも全画面シートに退避させている。

import { useState } from "react";
import { fmtMinutes, playTap, type TaskSet } from "./lib";
import { HandCheck, HandUnderline, InkButton, PaperCard, Stamp } from "./ui";
import { Nem } from "./nem";

type NightFlags = { isDeepNight: boolean; isPastMidnight: boolean };

// ─── シートの枠 ─────────────────────────────────────────────────────────────

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // AnimatePresence の exit を使わない。exit が完了しないと
  // opacity:0 / pointer-events:auto の全画面要素が残り、
  // 画面全体がクリック不能になるため（発表中に致命的）。
  return (
    <div className="fade-in fixed inset-0 z-50 flex flex-col">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(20,26,46,0.42)" }}
        onClick={onClose}
      />
      <div
        className="slide-up-sheet relative mt-auto flex max-h-[92vh] w-full flex-col overflow-hidden sm:mx-auto sm:mb-auto sm:mt-16 sm:max-w-lg"
        style={{
          background: "var(--page-bg)",
          borderTopLeftRadius: 30,
          borderTopRightRadius: 26,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          border: "1.5px solid var(--pencil-strong)",
          borderBottom: "none",
        }}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <h2 className="text-lg font-bold tracking-wide">{title}</h2>
            <HandUnderline width={74} />
          </div>
          <button
            onClick={() => {
              playTap();
              onClose();
            }}
            aria-label="閉じる"
            className="tap-shrink flex h-9 w-9 items-center justify-center rounded-full text-ink-soft"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-10">{children}</div>
      </div>
    </div>
  );
}

// ─── 記録シート ─────────────────────────────────────────────────────────────

export function LogSheet({
  taskSets,
  currentId,
  night,
  onOpen,
  onDelete,
  onResetProgress,
  onClose,
}: {
  taskSets: TaskSet[];
  currentId: string | null;
  night: NightFlags;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onResetProgress: () => void;
  onClose: () => void;
}) {
  const current = taskSets.find((s) => s.id === currentId) ?? null;
  const past = taskSets.filter((s) => s.id !== currentId);
  const achievedDays = taskSets.filter((s) => s.review?.achieved).length;

  return (
    <Sheet title="これまでの記録" onClose={onClose}>
      {taskSets.length === 0 ? (
        <div className="py-10 text-center">
          <div className="mb-4 flex justify-center">
            <Nem expression={night.isDeepNight ? "sleepy" : "default"} size={76} />
          </div>
          <p className="text-sm text-ink-soft">
            まだ記録がないよ。
            <br />
            ひとつ終えたら、ここに残るね。
          </p>
        </div>
      ) : (
        <>
          {/* サマリー */}
          <PaperCard className="mb-5 flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-ink-soft">
                合格できた日
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums">
                {achievedDays}
                <span className="ml-1 text-sm font-normal text-ink-faint">
                  / {taskSets.length}日
                </span>
              </p>
            </div>
            {achievedDays > 0 && <Stamp text="えらい" tone="sage" size="sm" />}
          </PaperCard>

          {/* 今日 */}
          {current && (
            <section className="mb-6">
              <p className="mb-2 text-[11px] font-bold tracking-wider text-ink-soft">
                いま取り組んでいる課題
              </p>
              <SetRow
                set={current}
                isCurrent
                onOpen={() => onOpen(current.id)}
                onDelete={() => onDelete(current.id)}
              />
              <button
                onClick={() => {
                  playTap();
                  onResetProgress();
                  onClose();
                }}
                className="mt-2 text-[11px] text-ink-faint underline decoration-dotted"
              >
                この課題の進捗をリセットする
              </button>
            </section>
          )}

          {/* 過去 */}
          {past.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-bold tracking-wider text-ink-soft">
                過去（{past.length}件）
              </p>
              <ul className="space-y-2.5">
                {past.map((s) => (
                  <li key={s.id}>
                    <SetRow
                      set={s}
                      onOpen={() => onOpen(s.id)}
                      onDelete={() => onDelete(s.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}

function SetRow({
  set,
  isCurrent = false,
  onOpen,
  onDelete,
}: {
  set: TaskSet;
  isCurrent?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const done = set.tasks.filter((t) => t.done).length;
  const totalMin = set.tasks.reduce((s, t) => s + t.minutes, 0);
  const pass = set.passCount;

  return (
    <div
      className="sticky-note hand-round-sm px-3.5 py-3"
      style={
        isCurrent ? { boxShadow: "0 0 0 2px var(--color-moon)" } : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[14px] font-bold">
            {set.review && (
              <span className="flex-shrink-0">
                {set.review.achieved ? (
                  <HandCheck size={15} animate={false} />
                ) : (
                  <span className="text-[13px] text-clay">—</span>
                )}
              </span>
            )}
            {set.topic}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">
            {set.tasks.length}タスク・{fmtMinutes(totalMin)}・{done}個完了
            {pass !== undefined && `・合格ライン${pass}個`}
          </p>
          {set.review?.memo && (
            <p className="mt-2 hand-round-sm bg-moon-2/30 px-2.5 py-1.5 text-[11.5px] leading-relaxed">
              {set.review.memo}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <InkButton size="sm" variant={isCurrent ? "moon" : "paper"} onClick={onOpen}>
            {isCurrent ? "続ける" : "開く"}
          </InkButton>
          <button
            onClick={() => {
              playTap();
              onDelete();
            }}
            aria-label="削除"
            className="text-[11px] text-ink-faint hover:text-clay"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 設定シート ─────────────────────────────────────────────────────────────

export function SettingsSheet({
  apiKey,
  setApiKey,
  night,
  onClose,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
  night: NightFlags;
  onClose: () => void;
}) {
  const [show, setShow] = useState(false);
  const [permission, setPermission] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  return (
    <Sheet title="設定" onClose={onClose}>
      {/* APIキー */}
      <PaperCard className="mb-4 px-4 py-4">
        <p className="mb-1 text-[12px] font-bold tracking-wide text-ink-soft">
          OpenAI APIキー
          {apiKey && <span className="ml-1.5 text-sage">✓ 設定済み</span>}
        </p>
        <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
          AI分解に使います。ブラウザにだけ保存され、外部には送りません。
          未設定でも「サンプルで試す」から全機能ためせます。
        </p>
        <div className="flex gap-2">
          <input
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="field hand-round-sm min-w-0 flex-1 px-3 py-2 font-mono text-[13px]"
          />
          <InkButton size="sm" variant="paper" onClick={() => setShow((v) => !v)}>
            {show ? "隠す" : "見る"}
          </InkButton>
        </div>
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] text-ink-soft underline decoration-dotted"
        >
          キーを取得する（platform.openai.com）
        </a>
      </PaperCard>

      {/* 通知 */}
      <PaperCard className="mb-4 px-4 py-4">
        <p className="mb-1 text-[12px] font-bold tracking-wide text-ink-soft">通知</p>
        <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
          予定時間を過ぎたとき、音とブラウザ通知でネムが知らせます。
          いまの状態：<span className="font-mono">{permission}</span>
        </p>
        <InkButton
          size="sm"
          variant="paper"
          onClick={async () => {
            if (typeof Notification === "undefined") return;
            const p = await Notification.requestPermission();
            setPermission(p);
          }}
        >
          通知を許可する
        </InkButton>
      </PaperCard>

      {/* このアプリ */}
      <PaperCard className="mb-4 px-4 py-4">
        <div className="mb-2 flex items-center gap-2.5">
          <Nem expression={night.isDeepNight ? "sleepy" : "happy"} size={44} />
          <div>
            <p className="text-[13px] font-bold">Task Breaker</p>
            <p className="text-[11px] text-ink-faint">
              今日はここまで、と決められるアプリ
            </p>
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-soft">
          終わりが見えない作業で徹夜しないために、
          <span className="marker font-bold">はじめる前に合格ラインを決める</span>
          。決めたラインを超えたら、ネムが「もう終わっていい」と言ってくれます。
        </p>
        <a
          href="https://github.com/s24c3118ch-ops/task-breaker"
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-block text-[11px] text-ink-soft underline decoration-dotted"
        >
          GitHub リポジトリ
        </a>
      </PaperCard>

      <p className="text-center text-[10.5px] leading-relaxed text-ink-faint">
        {night.isDeepNight
          ? "いまは夜モード。画面の色をやわらげています。"
          : "23時を過ぎると、自動で夜モードになります。"}
      </p>
    </Sheet>
  );
}
