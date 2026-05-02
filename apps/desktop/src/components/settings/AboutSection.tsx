import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { Section } from "./_shared";

export function AboutSection() {
  const [version, setVersion] = useState<string>("…");
  const [status, setStatus] = useState<string>("");
  const [ready, setReady] = useState<{ version: string; notes?: string } | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  async function checkNow() {
    setStatus("checking…");
    try {
      const update = await check();
      if (!update) {
        setStatus("up to date");
        return;
      }
      setStatus(`update available · v${update.version}`);
      setReady({ version: update.version, ...(update.body ? { notes: update.body } : {}) });
    } catch (err) {
      setStatus(`⚠ ${(err as Error).message}`);
    }
  }

  async function installNow() {
    setStatus("downloading + installing…");
    try {
      const update = await check();
      if (!update) {
        setStatus("no update");
        return;
      }
      await update.downloadAndInstall();
      setStatus("installed — restarting");
      await relaunch();
    } catch (err) {
      setStatus(`⚠ ${(err as Error).message}`);
    }
  }

  return (
    <Section label="About">
      <p className="text-[14px] text-neutral-300">
        Passio v{version} · local-first desktop AI · MIT
      </p>
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={checkNow}
          className="rounded-md border border-passio-border bg-[#241B30] px-3 py-1 text-[13px] hover:border-passio-pulp"
        >
          Check for updates
        </button>
        {ready && (
          <button
            type="button"
            onClick={installNow}
            className="rounded-md bg-passio-pulp/80 px-3 py-1 text-[13px] text-black hover:bg-passio-pulp"
          >
            Install v{ready.version}
          </button>
        )}
        {status && <span className="text-[12px] text-neutral-400">{status}</span>}
      </div>
    </Section>
  );
}
