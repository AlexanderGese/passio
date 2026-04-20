/**
 * Boot splash shown until the sidecar answers its first ping. Hides the
 * avatar + panel so the user has a clear "waking up" signal and doesn't
 * wonder if the app is broken during the ~3s cold-start window.
 */
export function Splash() {
  return (
    <div className="fixed inset-0 flex items-end justify-end p-4 pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        <div className="flex items-center gap-3 rounded-2xl border border-passio-pulp/40 bg-[#1A1422]/95 px-4 py-3 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(168,85,247,0.3)]">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-passio-pulp/20 border-t-passio-pulp" />
            <div className="absolute inset-1 rounded-full bg-gradient-to-br from-passio-pulp to-passio-skin" />
          </div>
          <div>
            <p className="voice text-[15px] text-passio-cream">Passio waking up…</p>
            <p className="text-[11px] text-neutral-400">loading context · starting sidecar</p>
          </div>
        </div>
        <div className="h-16 w-16 animate-pulse-soft rounded-full bg-gradient-to-br from-passio-pulp/60 to-passio-skin/60 shadow-[0_0_40px_-5px_rgba(168,85,247,0.6)]" />
      </div>
    </div>
  );
}
