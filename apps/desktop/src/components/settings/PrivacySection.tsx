import { Section } from "./_shared";

export function PrivacySection() {
  return (
    <div className="space-y-2 text-xs">
      <Section label="Telemetry">
        <p className="text-emerald-300">
          Off. Passio never phones home. Only outbound traffic: LLM API calls with your keys.
        </p>
      </Section>
      <Section label="Where things live">
        <ul className="space-y-0.5 text-neutral-400">
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
      <Section label="At-rest encryption">
        <p className="text-neutral-400">
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
