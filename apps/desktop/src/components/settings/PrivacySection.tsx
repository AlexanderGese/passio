import { Section } from "./_shared";

export function PrivacySection() {
  return (
    <div className="space-y-2 text-[14px]">
      <Section label="Telemetry" hint="Does Passio phone home? No — ever.">
        <p className="text-emerald-300">
          Off. Passio never phones home. Only outbound traffic: LLM API calls with your keys.
        </p>
      </Section>
      <Section label="Where things live" hint="Local paths Passio uses on your machine. Safe to back up or nuke.">
        <ul className="space-y-0.5 text-neutral-200">
          <li>
            <code className="text-passio-pulp">~/.local/share/passio/db.sqlite</code> · DB
          </li>
          <li>
            <code className="text-passio-pulp">~/.local/share/passio/logs/</code> · logs
          </li>
          <li>
            <code className="text-passio-pulp">~/.config/passio/</code> · config + pairing token
          </li>
        </ul>
      </Section>
      <Section label="At-rest encryption" hint="Encrypt the Context DB with SQLCipher. Requires a SQLCipher-patched libsqlite3 on PATH.">
        <p className="text-neutral-200">
          Passio's Context DB can be encrypted with SQLCipher. Requires a SQLCipher-patched{" "}
          <code className="text-passio-pulp">libsqlite3</code> on the system path (stock{" "}
          <code className="text-passio-pulp">bun:sqlite</code> is not SQLCipher-compiled). Store
          your key as <code className="text-passio-pulp">db_cipher</code> in the Keys section —
          Passio will pass it as <code>PRAGMA key</code> on open.
        </p>
      </Section>
    </div>
  );
}
