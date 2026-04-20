import clsx from "clsx";
import { useEffect, useState } from "react";
import {
  keychainApi,
  onBubbleState,
  onHotkey,
  onScanResult,
  onSelectionResult,
  onSidecarLog,
  onSeedEvent,
  personaApi,
  pingSidecar,
  seedsHotkeyBridge,
  whatNextApi,
  visionApi,
} from "../ipc";
import { PassioAvatar } from "../avatar/PassioAvatar";
import { usePassioStore } from "../store";
import { invoke } from "@tauri-apps/api/core";
import { FirstRunWizard } from "./FirstRunWizard";
import { SettingsPanel } from "./SettingsPanel";
import { SpeechBubble } from "./SpeechBubble";
import { Spotlight } from "./Spotlight";
import { Splash } from "./Splash";
import { MiniWidget } from "./MiniWidget";
import { CornerHUD } from "./CornerHUD";
import { SeedWidgets } from "./SeedWidgets";
import { HeaderStrip } from "./HeaderStrip";
import { ChatWithHistory } from "./ChatWithHistory";
import { DoPanel } from "./DoPanel";
import { KnowPanel } from "./KnowPanel";
import { PulsePanel } from "./PulsePanel";
import { GrowPanel } from "./GrowPanel";
import { ClipboardChip } from "./Widgets";
import { playWithLipsync } from "../avatar/lipsync";
import { voiceApi } from "../ipc";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const TABS = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "do", label: "Do", icon: "✓" },
  { id: "know", label: "Know", icon: "🧠" },
  { id: "pulse", label: "Pulse", icon: "📊" },
  { id: "grow", label: "Grow", icon: "🌱" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const;

export function Bubble() {
  const {
    bubble,
    expanded,
    tab,
    nudge,
    speech,
    assistantName,
    sidecarReady,
    hasBooted,
    lastPing,
    activity,
    autoSpeak,
    posture,
    errors,
    setBubble,
    setExpanded,
    toggleExpanded,
    setTab,
    setSidecarReady,
    setHasBooted,
    setLastPing,
    setNudge,
    setSpeech,
    setAssistantName,
    setActivity,
    setAutoSpeak,
    setPosture,
    setMouthLevel,
    pushError,
    setSpotlightOpen,
    setClipboardChip,
  } = usePassioStore();
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { firstRunApi, keychainApi: kc } = await import("../ipc");
        const { done } = await firstRunApi.get();
        if (done) return;
        const hasKey = await kc.has("openai");
        if (hasKey) {
          await firstRunApi.mark().catch(() => {});
          return;
        }
        setShowWizard(true);
      } catch {
        keychainApi
          .has("openai")
          .then((has) => {
            if (!has) setShowWizard(true);
          })
          .catch(() => undefined);
      }
    })();
    personaApi
      .get()
      .then((p) => setAssistantName(p.name))
      .catch(() => undefined);
    (async () => {
      try {
        const granted = await isPermissionGranted();
        if (!granted) await requestPermission();
      } catch {
        /* headless */
      }
    })();
  }, [setAssistantName]);

  // First-ping booter
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await pingSidecar();
        if (r.pong) {
          setHasBooted(true);
          setSidecarReady(true);
          // Once sidecar is up, reconcile seed-declared hotkeys into Rust.
          void seedsHotkeyBridge.reconcile().catch(() => undefined);
          return true;
        }
      } catch {
        /* not ready yet */
      }
      return false;
    };
    void poll().then((ok) => {
      if (ok) return;
      const t = setInterval(async () => {
        if (await poll()) clearInterval(t);
      }, 500);
      setTimeout(() => clearInterval(t), 30_000);
    });
  }, [setHasBooted, setSidecarReady]);

  // Resize the OS-level bubble window based on whether ANY chrome is visible.
  // When collapsed with nothing overlayed, the window shrinks to 96×96 so the
  // desktop behind us is fully clickable. When the user opens spotlight, we
  // get a speech bubble, a nudge, or a clipboard chip, etc. — we temporarily
  // grow back to full size so the overlay has room to render.
  const spotlightOpen = usePassioStore((s) => s.spotlightOpen);
  const clipboardChip = usePassioStore((s) => s.clipboardChip);
  const needsSpace =
    expanded ||
    speech !== null ||
    nudge !== null ||
    clipboardChip !== null ||
    spotlightOpen;
  useEffect(() => {
    invoke("set_bubble_expanded", { expanded: needsSpace }).catch(() => undefined);
  }, [needsSpace]);

  // Re-reconcile seed hotkeys whenever the seed set changes.
  useEffect(() => {
    const p = onSeedEvent((ev) => {
      if (
        ev.kind === "started" ||
        ev.kind === "stopped" ||
        ev.kind === "dev_started" ||
        ev.kind === "dev_reloaded"
      ) {
        void seedsHotkeyBridge.reconcile().catch(() => undefined);
      }
    });
    return () => {
      p.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const unsubs: Promise<() => void>[] = [
      onBubbleState((s) => {
        setBubble(s.state);
        if (s.state === "alert" && s.message) {
          setSpeech({ message: s.message, ts: Date.now(), ttlMs: 10_000 });
          setActivity(`📣 ${s.message.slice(0, 40)}…`);
          if (usePassioStore.getState().autoSpeak) {
            void speakOut(s.message, setMouthLevel);
          }
          notify(usePassioStore.getState().assistantName, s.message);
        }
      }),
      onSidecarLog((log) => {
        if (log.message.includes("ready")) {
          setSidecarReady(true);
          setHasBooted(true);
          setActivity("ready");
        }
        if (log.message.includes("shutdown")) {
          setSidecarReady(false);
          setActivity("sleeping");
        }
        if (log.message.includes("spawning")) setActivity("waking up");
        if (log.level === "warn" || log.level === "error") {
          pushError({ ts: Date.now(), level: log.level, message: log.message });
        }
        console.log(`[sidecar:${log.level}]`, log.message);
      }),
      onHotkey((name) => {
        // Seed-scoped hotkey ids look like `seed:<name>:<id>` — forward to
        // the sidecar which dispatches to the owning seed's worker.
        if (name.startsWith("seed:")) {
          void seedsHotkeyBridge.fire(name).catch(() => undefined);
          return;
        }
        if (name === "quick-chat") {
          setTab("chat");
          setExpanded(true);
        }
        if (name === "toggle-bubble") toggleExpanded();
        if (name === "spotlight") setSpotlightOpen(true);
        if (name === "screenshot-ask") {
          setActivity("capturing screen…");
          void visionApi.ask().then((r) => {
            setSpeech({ message: r.answer, ts: Date.now(), ttlMs: 20_000 });
            setBubble("talking");
            setTimeout(() => setBubble("idle"), 2_500);
          });
        }
        if (name === "what-next") {
          void whatNextApi.pick().catch(() => undefined);
        }
        if (name === "clipboard-ask") {
          navigator.clipboard
            .readText()
            .then((t) => {
              if (t?.trim()) setClipboardChip({ text: t.trim(), ts: Date.now() });
            })
            .catch(() => undefined);
        }
      }),
      onSelectionResult((r) => {
        const msg = r.ok
          ? r.kind === "translate"
            ? `translated → ${r.text!.slice(0, 140)}`
            : `rewrite copied · ${r.text!.slice(0, 120)}…`
          : `⚠ ${r.kind}: ${r.error ?? "failed"}`;
        setNudge({ message: msg, ts: Date.now() });
        setBubble(r.ok ? "talking" : "alert");
        setTimeout(() => setBubble("idle"), 1800);
      }),
      onScanResult((r) => {
        if (r.decision !== "quiet" && r.message) {
          setSpeech({ message: r.message, ts: Date.now(), ttlMs: 8_000 });
          setBubble("talking");
          setActivity(`💭 ${r.message.slice(0, 40)}…`);
          if (usePassioStore.getState().autoSpeak) {
            void speakOut(r.message, setMouthLevel);
          }
          notify(usePassioStore.getState().assistantName, r.message);
          setTimeout(() => setBubble("idle"), 2_200);
        } else if (r.decision === "quiet") {
          setActivity("quiet · nothing to say");
        }
      }),
    ];
    return () => {
      for (const p of unsubs) p.then((fn) => fn()).catch(() => {});
    };
  }, [
    setBubble,
    setExpanded,
    toggleExpanded,
    setTab,
    setSidecarReady,
    setNudge,
    setSpeech,
    setActivity,
    setMouthLevel,
    pushError,
    setSpotlightOpen,
    setHasBooted,
    setClipboardChip,
  ]);

  async function handleClick() {
    toggleExpanded();
    try {
      const t0 = performance.now();
      const res = await pingSidecar();
      setLastPing(Math.round(performance.now() - t0));
      setSidecarReady(res.pong === true);
    } catch (err) {
      console.error("ping failed", err);
    }
  }

  if (!hasBooted && !showWizard) {
    return <Splash />;
  }

  if (showWizard) {
    return (
      <div className="fixed inset-0 flex items-end justify-end p-4 pointer-events-none">
        <FirstRunWizard onDone={() => setShowWizard(false)} />
      </div>
    );
  }

  const recentErrors = errors.filter((e) => Date.now() - e.ts < 10 * 60_000).length;

  return (
    <>
      <Spotlight />
      <ClipboardChip
        onAsk={(text) => {
          setTab("chat");
          setExpanded(true);
          // Queue the clipboard text into the next chat send — done via a
          // simple event on window; ChatPanel listens for it.
          window.dispatchEvent(new CustomEvent("passio-chat-prefill", { detail: text }));
        }}
      />

      <div className="fixed inset-0 flex flex-col items-end justify-end p-4 pointer-events-none">
        <SpeechBubble
          message={speech?.message ?? null}
          ttlMs={speech?.ttlMs ?? 6000}
          name={assistantName}
          onDone={() => setSpeech(null)}
        />

        {nudge && (
          <button
            type="button"
            className="pointer-events-auto no-drag mb-3 max-w-[380px] rounded-2xl border border-amber-400/40 bg-amber-950/85 px-4 py-3 text-left text-[14px] leading-snug text-amber-50 shadow-panel "
            onClick={() => setNudge(null)}
            onKeyDown={(e) => e.key === "Escape" && setNudge(null)}
          >
            <span className="mr-2">🍇</span>
            {nudge.message}
            <span className="ml-2 text-[11px] text-amber-300/80">click to dismiss</span>
          </button>
        )}

        {expanded && (
          <div
            className="no-drag pointer-events-auto animate-panel-pop mb-3 flex h-[680px] w-[468px] flex-col overflow-hidden rounded-2xl bg-[#1A1422] text-passio-cream shadow-[0_30px_60px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(168,85,247,0.4),0_0_60px_-8px_rgba(168,85,247,0.55)]"
            style={{
              backgroundImage:
                "radial-gradient(1000px 200px at 100% 0%, rgba(168,85,247,0.12), transparent 60%), radial-gradient(900px 300px at 0% 100%, rgba(255,184,77,0.08), transparent 60%)",
            }}
          >
            <Header
              name={assistantName}
              sidecarReady={sidecarReady}
              lastPing={lastPing}
              activity={activity}
              autoSpeak={autoSpeak}
              posture={posture}
              recentErrors={recentErrors}
              onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
              onCyclePosture={() => {
                const next = posture === "quiet" ? "active" : posture === "active" ? "proactive" : "quiet";
                setPosture(next);
                void applyPosture(next);
              }}
              onOpenErrors={() => setTab("pulse")}
              onWhatNext={() =>
                whatNextApi.pick().catch(() => undefined)
              }
              onOpenSpotlight={() => setSpotlightOpen(true)}
            />
            <Tabs current={tab} onPick={setTab} recentErrors={recentErrors} />
            <div
              key={tab}
              className="min-h-0 flex-1 animate-tab-in overflow-hidden px-4 py-3"
            >
              {tab === "chat" && <ChatWithHistory />}
              {tab === "do" && <DoPanel />}
              {tab === "know" && <KnowPanel />}
              {tab === "pulse" && <PulsePanel />}
              {tab === "grow" && <GrowPanel />}
              {tab === "settings" && <SettingsPanel onRunWizard={() => setShowWizard(true)} />}
            </div>
          </div>
        )}

        {/* Mini widget only when there's room (any overlay already expanded
         * the window). Otherwise the tiny 96×96 collapsed window would clip
         * it and it'd look broken. */}
        {needsSpace && <MiniWidget />}
        <button
          type="button"
          onClick={handleClick}
          className="pointer-events-auto drag-region rounded-full border-0 bg-transparent p-0 transition-transform hover:scale-105 focus:outline-none"
          aria-label="Toggle Passio"
        >
          <AvatarWithLevel state={bubble} />
        </button>
      </div>
      <CornerHUD />
      <SeedWidgets slot="corner" />
    </>
  );
}

function AvatarWithLevel({ state }: { state: ReturnType<typeof usePassioStore.getState>["bubble"] }) {
  const mouthLevel = usePassioStore((s) => s.mouthLevel);
  return <PassioAvatar state={state} sizePx={64} mouthLevel={mouthLevel} />;
}

function notify(title: string, body: string): void {
  try {
    sendNotification({ title, body });
  } catch {
    /* no-op */
  }
}

async function speakOut(text: string, setMouthLevel: (v: number) => void): Promise<void> {
  try {
    const tts = await voiceApi.synthesize({ text: text.slice(0, 500) });
    await playWithLipsync({
      base64: tts.audio_base64,
      mimeType: tts.mime_type,
      onLevel: setMouthLevel,
      onDone: () => setMouthLevel(0),
    });
  } catch {
    /* silent */
  }
}

function Header({
  name,
  sidecarReady,
  lastPing,
  activity,
  autoSpeak,
  posture,
  recentErrors,
  onToggleAutoSpeak,
  onCyclePosture,
  onOpenErrors,
  onWhatNext,
  onOpenSpotlight,
}: {
  name: string;
  sidecarReady: boolean;
  lastPing: number | null;
  activity: string;
  autoSpeak: boolean;
  posture: "quiet" | "active" | "proactive";
  recentErrors: number;
  onToggleAutoSpeak: () => void;
  onCyclePosture: () => void;
  onOpenErrors: () => void;
  onWhatNext: () => void;
  onOpenSpotlight: () => void;
}) {
  const postureGlyph = posture === "quiet" ? "🌙" : posture === "active" ? "☀" : "⚡";
  const postureLabel =
    posture === "quiet" ? "Quiet" : posture === "active" ? "Active" : "Proactive+";
  return (
    <header className="border-b border-passio-border bg-[#241B30]">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-passio-pulpBright">
            Passio
          </span>
          <span className="text-[15px] font-semibold text-passio-cream">{name}</span>
        </div>
        <div className="flex items-center gap-1 text-[12px] text-neutral-300">
          <HeaderStrip
            autoSpeak={autoSpeak}
            posture={posture}
            postureGlyph={postureGlyph}
            postureLabel={postureLabel}
            onToggleAutoSpeak={onToggleAutoSpeak}
            onCyclePosture={onCyclePosture}
            onWhatNext={onWhatNext}
            onOpenSpotlight={onOpenSpotlight}
          />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-[11px]">
        <span className="truncate text-neutral-300">{activity}</span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          {recentErrors > 0 && (
            <button
              type="button"
              onClick={onOpenErrors}
              className="flex items-center gap-1 rounded-md bg-red-500/20 px-1.5 py-0.5 text-red-200 hover:bg-red-500/30"
              title={`${recentErrors} recent issue${recentErrors === 1 ? "" : "s"}`}
            >
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span>{recentErrors}</span>
            </button>
          )}
          <span
            className={clsx(
              "inline-block h-2 w-2 rounded-full",
              sidecarReady ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" : "bg-neutral-600",
            )}
            aria-hidden
          />
          <span>{sidecarReady ? "online" : "cold"}</span>
          {lastPing !== null && <span className="text-neutral-500">· {lastPing}ms</span>}
        </span>
      </div>
    </header>
  );
}

async function applyPosture(p: "quiet" | "active" | "proactive") {
  const { proactiveApi, dndApi } = await import("../ipc");
  try {
    if (p === "quiet") {
      await proactiveApi.set({ mode: "check-in", interval_min: 30 });
      await dndApi.set(120);
    } else if (p === "active") {
      await proactiveApi.set({ mode: "active-assist", interval_min: 7 });
      await dndApi.set(null);
    } else {
      await proactiveApi.set({ mode: "active-assist", interval_min: 5 });
      await dndApi.set(null);
    }
  } catch {
    /* ignore */
  }
}

function Tabs({
  current,
  onPick,
  recentErrors,
}: {
  current: string;
  onPick: (t: (typeof TABS)[number]["id"]) => void;
  recentErrors: number;
}) {
  return (
    <nav className="flex overflow-x-auto border-b border-passio-border bg-[#1F1628]">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          className={clsx(
            "relative shrink-0 border-b-2 px-2.5 py-2 text-[12px] font-medium transition-colors",
            current === t.id
              ? "border-passio-pulp text-passio-pulpBright"
              : "border-transparent text-neutral-400 hover:text-neutral-100",
          )}
          title={t.label}
        >
          <span className="mr-1">{t.icon}</span>
          <span>{t.label}</span>
          {t.id === "pulse" && recentErrors > 0 && (
            <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-400" />
          )}
        </button>
      ))}
    </nav>
  );
}
