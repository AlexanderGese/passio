import { useEffect, useState } from "react";
import { keychainApi } from "../../ipc";
import { Section } from "./_shared";

export function MailSection() {
  const [userHas, setUserHas] = useState(false);
  const [passHas, setPassHas] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    setUserHas(await keychainApi.has("mail_user"));
    setPassHas(await keychainApi.has("mail_pass"));
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    if (user.trim()) await keychainApi.set("mail_user", user.trim());
    if (pass.trim()) await keychainApi.set("mail_pass", pass.trim());
    setUser("");
    setPass("");
    await refresh();
    setStatus("saved — restart Passio to reconnect IMAP");
    setTimeout(() => setStatus(null), 3000);
  }
  async function clear() {
    await keychainApi.delete("mail_user");
    await keychainApi.delete("mail_pass");
    await refresh();
  }

  return (
    <div className="space-y-2 text-[14px]">
      <Section label="Gmail credentials" hint="Paste your Gmail address and a 16-char app-password (Google Account → Security → 2-Step Verification → App passwords). Enables inbox, send, search tools.">
        <p className="mb-2 text-[14px] text-neutral-200">
          Use a Google app-password (Account → Security → 2-Step Verification → App passwords).
          Stored locally in OS keychain — never leaves your machine except to smtp.gmail.com / imap.gmail.com.
        </p>
        <label className="block">
          <span className="text-[14px] text-neutral-300">
            Email {userHas && <span className="text-emerald-400">✓ stored</span>}
          </span>
          <input
            type="email"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="you@gmail.com"
            className="no-drag mt-0.5 w-full rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
        </label>
        <label className="mt-2 block">
          <span className="text-[14px] text-neutral-300">
            App password {passHas && <span className="text-emerald-400">✓ stored</span>}
          </span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="16-char app password"
            className="no-drag mt-0.5 w-full rounded-md border border-passio-border bg-[#241B30] p-1.5 focus:border-passio-pulp focus:outline-none"
          />
        </label>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!user.trim() && !pass.trim()}
            className="rounded-md bg-passio-pulp/80 px-2 py-1 text-black hover:bg-passio-pulp disabled:opacity-40"
          >
            save
          </button>
          {(userHas || passHas) && (
            <button
              type="button"
              onClick={clear}
              className="rounded-md bg-red-900/40 px-2 py-1 text-red-200 hover:bg-red-900/60"
            >
              forget both
            </button>
          )}
        </div>
        {status && <p className="mt-2 text-[14px] text-emerald-300">{status}</p>}
      </Section>
    </div>
  );
}
