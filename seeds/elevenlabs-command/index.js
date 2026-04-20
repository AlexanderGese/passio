export default async function init(passio) {
  async function api(path, { method = "GET", body, raw } = {}) {
    const key = await passio.secrets.get("api_key"); if (!key) throw new Error("set api_key");
    const r = await passio.net.fetch("https://api.elevenlabs.io" + path, { init: { method, headers: { "xi-api-key": key, ...(body && !raw ? { "content-type": "application/json" } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) } });
    if (r.status >= 400) { const js = await r.json().catch(() => ({})); throw new Error(`11L ${r.status}: ${JSON.stringify(js).slice(0, 200)}`); }
    return r;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("user", "", async () => (await api("/v1/user")).json());
  await reg("voices", "", async () => (await api("/v1/voices")).json());
  await reg("history", "", async () => (await api("/v1/history?page_size=20")).json());
  await reg("speak", "{ text, voice_id?, model_id? } → returns base64 audio", async ({ text, voice_id, model_id = "eleven_turbo_v2_5" }) => {
    const v = voice_id ?? (await passio.kv.get("default_voice"));
    if (!v) throw new Error("set default_voice or pass voice_id");
    const r = await api(`/v1/text-to-speech/${v}`, { method: "POST", body: { text, model_id } });
    const buf = await r.arrayBuffer();
    return { mime: "audio/mpeg", audio_base64: Buffer.from(buf).toString("base64") };
  });
  await reg("clone", "{ name, description?, files_urls? } — not implemented in seed, use the web UI for cloning", async () => ({ stub: true, note: "Voice cloning requires multipart audio upload — do it in ElevenLabs UI, then reference the voice id here." }));
}
