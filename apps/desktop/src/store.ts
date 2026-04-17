import type { BubbleState } from "@passio/shared";
import { create } from "zustand";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

export type PanelTab = "chat" | "goals" | "browser";

interface PassioState {
  bubble: BubbleState["state"];
  expanded: boolean;
  tab: PanelTab;
  sidecarReady: boolean;
  lastPing: number | null;
  conversationId: number | null;
  messages: ChatMessage[];
  isThinking: boolean;
  setBubble: (s: BubbleState["state"]) => void;
  setExpanded: (open: boolean) => void;
  toggleExpanded: () => void;
  setTab: (t: PanelTab) => void;
  setSidecarReady: (ready: boolean) => void;
  setLastPing: (ms: number) => void;
  setConversationId: (id: number | null) => void;
  appendMessage: (m: ChatMessage) => void;
  setIsThinking: (v: boolean) => void;
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
  setBubble: (bubble) => set({ bubble }),
  setExpanded: (expanded) => set({ expanded }),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
  setTab: (tab) => set({ tab }),
  setSidecarReady: (sidecarReady) => set({ sidecarReady }),
  setLastPing: (lastPing) => set({ lastPing }),
  setConversationId: (conversationId) => set({ conversationId }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setIsThinking: (isThinking) => set({ isThinking }),
  resetConversation: () => set({ messages: [], conversationId: null }),
}));
