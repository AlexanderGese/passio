import { useEffect, useRef } from "react";
import { seedsApi } from "../ipc";

/**
 * Mounts a seed's Web Component panel inside a sandboxed iframe so its
 * scripts can run without touching the main HUD's DOM. The iframe bridges
 * back to the host via `window.parent.postMessage` → a thin `passio` RPC
 * proxy in the iframe calls `passio.seed.invokeTool` on the sidecar.
 */
export function SeedPanelHost({
  seedName,
  panel,
  elementId,
  compact,
}: {
  seedName: string;
  panel: string;
  elementId: string;
  compact?: "header" | "corner";
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mount = async () => {
      if (!ref.current) return;
      const { src } = await seedsApi.panelSrc(seedName, panel);
      if (cancelled || !ref.current) return;
      const html = iframeHtml(seedName, elementId, src);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      ref.current.src = url;
      // Free the blob URL after a beat.
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    };
    void mount();

    function onMessage(ev: MessageEvent) {
      if (ev.source !== ref.current?.contentWindow) return;
      const data = ev.data as { id: string; seed: string; tool: string; args: unknown };
      if (!data?.id || data.seed !== seedName) return;
      seedsApi
        .invokeTool(seedName, data.tool, data.args)
        .then((result) =>
          ref.current?.contentWindow?.postMessage({ id: data.id, result }, "*"),
        )
        .catch((err) =>
          ref.current?.contentWindow?.postMessage({ id: data.id, error: (err as Error).message }, "*"),
        );
    }
    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, [seedName, panel, elementId]);

  const cls =
    compact === "header"
      ? "no-drag h-[26px] rounded-md border-0 bg-transparent"
      : compact === "corner"
        ? "no-drag h-[120px] w-[220px] rounded-xl border border-passio-border bg-[#120E1A]/90"
        : "no-drag h-[280px] w-full rounded-md border border-passio-border bg-[#120E1A]";
  const styleWidth = compact === "header" ? { width: 120 } : undefined;
  return (
    <iframe
      ref={ref}
      title={`seed-${seedName}`}
      sandbox="allow-scripts"
      className={cls}
      style={styleWidth}
    />
  );
}

function iframeHtml(seedName: string, elementId: string, panelSrc: string): string {
  const safeSrc = panelSrc.replace(/<\/script>/g, "<\\/script>");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:8px;background:transparent;color:#F5EAFF;font:13px/1.4 system-ui,sans-serif}
  button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:inherit;cursor:pointer}
  button:hover{background:#2E2340}
  input,textarea,select{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #3A2E4C;background:#1A1422;color:inherit}
  a{color:#ff6b9d}
</style></head><body>
  <${elementId}></${elementId}>
  <script type="module">
    const pending=new Map();
    window.addEventListener("message",(e)=>{
      const p=pending.get(e.data?.id);
      if(!p)return;
      pending.delete(e.data.id);
      if(e.data.error)p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    });
    function call(tool,args){
      const id=Math.random().toString(36).slice(2);
      return new Promise((resolve,reject)=>{
        pending.set(id,{resolve,reject});
        parent.postMessage({id,seed:${JSON.stringify(seedName)},tool,args},"*");
      });
    }
    window.passio={ invoke: call };
  </script>
  <script type="module">${safeSrc}</script>
</body></html>`;
}
