// ─── Shared types / storage / samples / notify / priority ──────────────────

export type Priority = "high" | "medium" | "low";

export type Task = {
  id: number;
  label: string;
  minutes: number;
  done: boolean;
  priority: Priority;
  memo: string;
};

export type Review = {
  at: number;
  achieved: boolean;
  memo: string;
};

export type TaskSet = {
  id: string;
  topic: string;
  tasks: Task[];
  deadline: string; // ISO date or ""
  createdAt: number;
  passLine?: string;
  /** 今日の合格ライン = 上から何タスク終わらせれば合格か */
  passCount?: number;
  review?: Review;
};

export type Tab = "home" | "focus" | "log" | "settings";

// ─── 6ステップの体験フロー ─────────────────────────────────────────────────
// 1 課題入力 → 2 AI分解 → 3 合格ライン → 4 タスク選択 → 5 集中 → 6 振り返り

export type Step = 1 | 2 | 3 | 4 | 5 | 6;

export const STEP_MAX: Step = 6;

/** 保存データからいま居るべきステップを復元する */
export function deriveStep(set: TaskSet | null): Step {
  if (!set || set.tasks.length === 0) return 1;
  if (set.review) return 6;
  if (set.passCount === undefined) return 3;
  return 4;
}

/**
 * 今日の合格ライン（タスク数）。
 * 合格ライン決定後にタスクを削除すると passCount がタスク数を超え、
 * 「2/3 で永久に達成できない」状態になるため、必ずここを通して読む。
 */
export function passTarget(set: TaskSet): number {
  const raw = set.passCount ?? set.tasks.length;
  if (set.tasks.length === 0) return 0;
  return Math.max(1, Math.min(raw, set.tasks.length));
}

/** 今日の対象タスク（合格ライン内） */
export function todayTasks(set: TaskSet): Task[] {
  return set.tasks.slice(0, passTarget(set));
}

/** 合格ラインの重さを判定。深夜なら基準を厳しくする。 */
export type LoadLevel = "light" | "fair" | "heavy";

export function judgeLoad(minutes: number, deepNight = false): {
  level: LoadLevel;
  label: string;
  hint: string;
} {
  const limitFair = deepNight ? 45 : 90;
  const limitHeavy = deepNight ? 90 : 180;
  if (minutes <= limitFair)
    return {
      level: "light",
      label: "無理のない量",
      hint: "これなら今日のうちに終われるね。",
    };
  if (minutes <= limitHeavy)
    return {
      level: "fair",
      label: "ちょうど良い量",
      hint: "集中すれば届く量。休憩も入れていこう。",
    };
  return {
    level: "heavy",
    label: "少し多いかも",
    hint: deepNight
      ? "この時間からこの量は、明日にひびくかも。"
      : "欲張りすぎてない？ 減らしても大丈夫だよ。",
  };
}

export function fmtMinutes(m: number): string {
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}時間` : `${h}時間${r}分`;
}

// ─── Storage keys ──────────────────────────────────────────────────────────

export const STORAGE_KEY = "task-breaker-v2";
export const API_KEY_STORAGE = "task-breaker-api-key";
export const GUIDES_STORAGE = "task-breaker-guides-seen-v1";
export const FOCUS_TASK_STORAGE = "task-breaker-focus-task-id";

export function loadStorage(): { taskSets: TaskSet[]; currentId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { taskSets: [], currentId: null };
    return JSON.parse(raw);
  } catch {
    return { taskSets: [], currentId: null };
  }
}

export function saveStorage(taskSets: TaskSet[], currentId: string | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ taskSets, currentId }));
}

export function genId() {
  return Math.random().toString(36).slice(2);
}

// ─── Deep night (>= 23 or < 5) ─────────────────────────────────────────────

export function isDeepNight(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 23 || h < 5;
}

export function isPastMidnight(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 0 && h < 5;
}

// ─── Sample data ───────────────────────────────────────────────────────────

export const SAMPLE_DATA: Record<string, { label: string; minutes: number }[]> = {
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

export const SAMPLE_KEYS = Object.keys(SAMPLE_DATA);
export const DEFAULT_SAMPLE_KEY = "期末レポート";

export function pickSample(topic: string): {
  key: string;
  tasks: { label: string; minutes: number }[];
} {
  const t = topic.trim();
  if (!t) {
    const key = SAMPLE_KEYS[Math.floor(Math.random() * SAMPLE_KEYS.length)];
    return { key, tasks: SAMPLE_DATA[key] };
  }
  const hit = SAMPLE_KEYS.find((k) => t.includes(k) || k.includes(t));
  const key = hit ?? DEFAULT_SAMPLE_KEY;
  return { key, tasks: SAMPLE_DATA[key] };
}

// ─── Notification: audio + browser ─────────────────────────────────────────

// Shared AudioContext (created lazily on first user-gesture-driven sound)
let _audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      _audioCtx = new AudioCtx();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

let _muted = false;
export function setMuted(v: boolean) { _muted = v; }
export function isMuted() { return _muted; }

type Wave = OscillatorType;

/** 1音を鳴らす。freqは数値 or [start,end]でグライド。 */
function tone(
  freq: number | [number, number],
  duration: number,
  delayMs = 0,
  { type = "sine", vol = 0.22 }: { type?: Wave; vol?: number } = {}
) {
  if (_muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  if (Array.isArray(freq)) {
    osc.frequency.setValueAtTime(freq[0], t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq[1]), t0 + duration / 1000);
  } else {
    osc.frequency.setValueAtTime(freq, t0);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration / 1000 + 0.02);
}

/** 軽いタップ音（ポン） */
export function playTap() {
  tone(520, 90, 0, { type: "sine", vol: 0.14 });
}

/** タスク完了音（ふわっと上がるチャイム2音） */
export function playComplete() {
  tone(660, 140, 0, { type: "triangle", vol: 0.2 });
  tone(880, 200, 110, { type: "triangle", vol: 0.2 });
}

/** 全完了ファンファーレ（3音の上昇＋キラ） */
export function playFanfare() {
  tone(660, 160, 0, { type: "triangle", vol: 0.22 });
  tone(880, 160, 130, { type: "triangle", vol: 0.22 });
  tone(1175, 320, 260, { type: "triangle", vol: 0.24 });
  tone([1400, 2400], 260, 320, { type: "sine", vol: 0.12 });
}

/** ネムをタップした時のかわいい音 */
export function playPop() {
  tone([420, 720], 120, 0, { type: "sine", vol: 0.16 });
}

export function playAlarm() {
  tone(880, 200, 0, { vol: 0.25 });
  tone(880, 200, 300, { vol: 0.25 });
  tone(1100, 400, 600, { vol: 0.25 });
}

export function sendNotification(title: string, body: string) {
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

export async function ensureNotifyPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}

// ─── Priority ──────────────────────────────────────────────────────────────

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; bg: string; dot: string }
> = {
  high:   { label: "高", color: "text-red-600",   bg: "bg-red-50",    dot: "bg-red-400" },
  medium: { label: "中", color: "text-amber-600", bg: "bg-amber-50",  dot: "bg-amber-400" },
  low:    { label: "低", color: "text-slate-500", bg: "bg-slate-50",  dot: "bg-slate-300" },
};

// ─── First-time guide keys ─────────────────────────────────────────────────

export type GuideKey =
  | "home-empty-cta"       // 空状態の大CTAへ矢印
  | "passline-hint"        // 分解後、合格ラインへ矢印
  | "task-timer"           // 初回タスク行のタイマーアイコンにパルス
  | "focus-tab-hint";      // タイマー起動時、Focusタブハイライト

export function loadSeenGuides(): Set<GuideKey> {
  try {
    const raw = localStorage.getItem(GUIDES_STORAGE);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as GuideKey[]);
  } catch {
    return new Set();
  }
}

export function saveSeenGuides(set: Set<GuideKey>) {
  localStorage.setItem(GUIDES_STORAGE, JSON.stringify(Array.from(set)));
}
