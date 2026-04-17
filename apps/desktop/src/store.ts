import type { BubbleState } from "@passio/shared";
import { create } from "zustand";

interface PassioState {
  bubble: BubbleState["state"];
  expanded: boolean;
  sidecarReady: boolean;
  lastPing: number | null;
  setBubble: (s: BubbleState["state"]) => void;
  setExpanded: (open: boolean) => void;
  setSidecarReady: (ready: boolean) => void;
  setLastPing: (ms: number) => void;
}

export const usePassioStore = create<PassioState>((set) => ({
  bubble: "idle",
  expanded: false,
  sidecarReady: false,
  lastPing: null,
  setBubble: (bubble) => set({ bubble }),
  setExpanded: (expanded) => set({ expanded }),
  setSidecarReady: (sidecarReady) => set({ sidecarReady }),
  setLastPing: (ms) => set({ lastPing: ms }),
}));
