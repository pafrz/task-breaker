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
  review?: Review;
};

export type Tab = "home" | "focus" | "log" | "settings";

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

export function playAlarm() {
  playBeep(880, 200, 0);
  playBeep(880, 200, 300);
  playBeep(1100, 400, 600);
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
