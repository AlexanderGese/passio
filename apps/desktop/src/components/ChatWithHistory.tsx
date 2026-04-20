import { useState } from "react";
import clsx from "clsx";
import { ChatPanel } from "./ChatPanel";
import { HistoryPanel } from "./HistoryPanel";

/**
 * Chat tab — with a slim toggle to flip into History. Keeps the Chat tab
 * as the one-stop conversational surface. No sub-tabs — just a single
 * button the user can tap to browse + search prior conversations.
 */
export function ChatWithHistory() {
  const [mode, setMode] = useState<"chat" | "history">("chat");
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setMode(mode === "chat" ? "history" : "chat")}
          className={clsx(
            "no-drag rounded-md px-2 py-0.5 text-[11px] transition-colors",
            mode === "history"
              ? "bg-passio-pulp text-passio-seed"
              : "bg-[#241B30] text-neutral-300 hover:text-passio-pulpBright",
          )}
          title={mode === "chat" ? "Browse prior conversations" : "Back to chat"}
        >
          {mode === "chat" ? "🕘 history" : "← back to chat"}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {mode === "chat" ? <ChatPanel /> : <HistoryPanel />}
      </div>
    </div>
  );
}
