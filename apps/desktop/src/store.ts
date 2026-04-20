import type { BubbleState } from "@passio/shared";
import { create } from "zustand";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

export type Nudge = { message: string; ts: number };
export type Speech = { message: string; ts: number; ttlMs: number };
export type ErrorEntry = { ts: number; level: "warn" | "error"; message: string };

export type PanelTab = "chat" | "do" | "know" | "pulse" | "grow" | "settings";

interface PassioState {
  bubble: BubbleState["state"];
  expanded: boolean;
  tab: PanelTab;
  sidecarReady: boolean;
  hasBooted: boolean;
  lastPing: number | null;
  conversationId: number | null;
  messages: ChatMessage[];
  isThinking: boolean;
  streamingText: string;
  mouthLevel: number;
  nudge: Nudge | null;
  speech: Speech | null;
  assistantName: string;
  activeGoalId: number | null;
  activeGoalTitle: string | null;
  activity: string;
  autoSpeak: boolean;
  posture: "quiet" | "active" | "proactive";
  errors: ErrorEntry[];
  spotlightOpen: boolean;
  clipboardChip: { text: string; ts: number } | null;
  pomodoro: { active: boolean; startedAt: number | null; durationMin: number };
  nextEvent: { summary: string; startsIn: number } | null;
  unreadMail: { count: number; preview: string | null } | null;
  weatherSummary: { temp: number; description: string } | null;
  setBubble: (s: BubbleState["state"]) => void;
  setExpanded: (open: boolean) => void;
  toggleExpanded: () => void;
  setTab: (t: PanelTab) => void;
  setSidecarReady: (ready: boolean) => void;
  setHasBooted: (v: boolean) => void;
  setLastPing: (ms: number) => void;
  setConversationId: (id: number | null) => void;
  appendMessage: (m: ChatMessage) => void;
  setIsThinking: (v: boolean) => void;
  appendStream: (d: string) => void;
  resetStream: () => void;
  setMouthLevel: (v: number) => void;
  setNudge: (n: Nudge | null) => void;
  setSpeech: (s: Speech | null) => void;
  setAssistantName: (n: string) => void;
  setActiveGoal: (id: number | null, title: string | null) => void;
  setActivity: (a: string) => void;
  setAutoSpeak: (v: boolean) => void;
  setPosture: (p: "quiet" | "active" | "proactive") => void;
  pushError: (e: ErrorEntry) => void;
  clearErrors: () => void;
  setSpotlightOpen: (v: boolean) => void;
  setClipboardChip: (c: { text: string; ts: number } | null) => void;
  setPomodoro: (p: { active: boolean; startedAt: number | null; durationMin: number }) => void;
  setNextEvent: (e: { summary: string; startsIn: number } | null) => void;
  setUnreadMail: (m: { count: number; preview: string | null } | null) => void;
  setWeatherSummary: (w: { temp: number; description: string } | null) => void;
  resetConversation: () => void;
}

export const usePassioStore = create<PassioState>((set) => ({
  bubble: "idle",
  expanded: false,
  tab: "chat",
  sidecarReady: false,
  hasBooted: false,
  lastPing: null,
  conversationId: null,
  messages: [],
  isThinking: false,
  streamingText: "",
  mouthLevel: 0,
  nudge: null,
  speech: null,
  assistantName: "Passio",
  activeGoalId: null,
  activeGoalTitle: null,
  activity: "ready",
  autoSpeak: true,
  posture: "active",
  errors: [],
  spotlightOpen: false,
  clipboardChip: null,
  pomodoro: { active: false, startedAt: null, durationMin: 25 },
  nextEvent: null,
  unreadMail: null,
  weatherSummary: null,
  setBubble: (bubble) => set({ bubble }),
  setExpanded: (expanded) => set({ expanded }),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
  setTab: (tab) => set({ tab }),
  setSidecarReady: (sidecarReady) => set({ sidecarReady }),
  setHasBooted: (hasBooted) => set({ hasBooted }),
  setLastPing: (lastPing) => set({ lastPing }),
  setConversationId: (conversationId) => set({ conversationId }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setIsThinking: (isThinking) => set({ isThinking }),
  appendStream: (d) => set((s) => ({ streamingText: s.streamingText + d })),
  resetStream: () => set({ streamingText: "" }),
  setMouthLevel: (mouthLevel) => set({ mouthLevel }),
  setNudge: (nudge) => set({ nudge }),
  setSpeech: (speech) => set({ speech }),
  setAssistantName: (assistantName) => set({ assistantName }),
  setActiveGoal: (activeGoalId, activeGoalTitle) =>
    set({ activeGoalId, activeGoalTitle, messages: [], conversationId: null, streamingText: "" }),
  setActivity: (activity) => set({ activity }),
  setAutoSpeak: (autoSpeak) => set({ autoSpeak }),
  setPosture: (posture) => set({ posture }),
  pushError: (e) => set((s) => ({ errors: [e, ...s.errors].slice(0, 50) })),
  clearErrors: () => set({ errors: [] }),
  setSpotlightOpen: (spotlightOpen) => set({ spotlightOpen }),
  setClipboardChip: (clipboardChip) => set({ clipboardChip }),
  setPomodoro: (pomodoro) => set({ pomodoro }),
  setNextEvent: (nextEvent) => set({ nextEvent }),
  setUnreadMail: (unreadMail) => set({ unreadMail }),
  setWeatherSummary: (weatherSummary) => set({ weatherSummary }),
  resetConversation: () =>
    set({ messages: [], conversationId: null, activeGoalId: null, activeGoalTitle: null }),
}));
