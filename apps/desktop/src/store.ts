import type { BubbleState } from "@passio/shared";
import { create } from "zustand";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

export type Nudge = { message: string; ts: number };
export type Speech = { message: string; ts: number; ttlMs: number };

export type PanelTab = "chat" | "history" | "goals" | "browser" | "focus" | "settings";

interface PassioState {
  bubble: BubbleState["state"];
  expanded: boolean;
  tab: PanelTab;
  sidecarReady: boolean;
  lastPing: number | null;
  conversationId: number | null;
  messages: ChatMessage[];
  isThinking: boolean;
  streamingText: string;
  mouthLevel: number;
  nudge: Nudge | null;
  speech: Speech | null;
  assistantName: string;
  setBubble: (s: BubbleState["state"]) => void;
  setExpanded: (open: boolean) => void;
  toggleExpanded: () => void;
  setTab: (t: PanelTab) => void;
  setSidecarReady: (ready: boolean) => void;
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
  resetConversation: () => void;
}

export const usePassioStore = create<PassioState>((set) => ({
  bubble: "idle",
  expanded: false,
  tab: "chat",
  sidecarReady: false,
  lastPing: null,
  conversationId: null,
  messages: [],
  isThinking: false,
  streamingText: "",
  mouthLevel: 0,
  nudge: null,
  speech: null,
  assistantName: "Passio",
  setBubble: (bubble) => set({ bubble }),
  setExpanded: (expanded) => set({ expanded }),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
  setTab: (tab) => set({ tab }),
  setSidecarReady: (sidecarReady) => set({ sidecarReady }),
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
  resetConversation: () => set({ messages: [], conversationId: null }),
}));
