export default async function init(passio) {
  async function check() {
    const before = Date.now();
    const r = await passio.net.fetch("https://worldtimeapi.org/api/ip");
    const body = await r.json();
    const network = new Date(body.utc_datetime).getTime();
    const rtt = Date.now() - before;
    const drift = Math.round((before - network + rtt / 2) / 1000);
    await passio.kv.set("drift_seconds", drift);
    await passio.kv.set("last_check", Date.now());
    return { driftSeconds: drift };
  }
  await passio.tools.register({
    name: "check",
    description: "Ping worldtimeapi and return drift seconds.",
    execute: check,
  });
  passio.schedule({ id: "tick", every_seconds: 900 }, () => check().catch(() => undefined));
  check().catch(() => undefined);
}
