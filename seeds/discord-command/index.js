/** discord-command — Discord Bot API remote. */
export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const tok = await passio.secrets.get("bot_token");
    if (!tok) throw new Error("set bot_token");
    const r = await passio.net.fetch("https://discord.com/api/v10" + path, {
      init: {
        method,
        headers: { Authorization: "Bot " + tok, "content-type": "application/json", "User-Agent": "passio-discord-command/0.1" },
        body: body ? JSON.stringify(body) : undefined,
      },
    });
    if (r.status === 204) return {};
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`discord ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return js;
  }

  const reg = (name, description, execute) => passio.tools.register({ name, description, execute });

  await reg("send", "Post in a channel. { channel_id, content }", async ({ channel_id, content, embeds }) => api(`/channels/${channel_id}/messages`, { method: "POST", body: { content, embeds } }));
  await reg("edit", "Edit a message. { channel_id, message_id, content }", async ({ channel_id, message_id, content }) => api(`/channels/${channel_id}/messages/${message_id}`, { method: "PATCH", body: { content } }));
  await reg("delete", "Delete a message. { channel_id, message_id }", async ({ channel_id, message_id }) => api(`/channels/${channel_id}/messages/${message_id}`, { method: "DELETE" }));
  await reg("guild_info", "Get a guild. { guild_id }", async ({ guild_id }) => api(`/guilds/${guild_id}`));
  await reg("channels", "List guild channels. { guild_id }", async ({ guild_id }) => api(`/guilds/${guild_id}/channels`));
  await reg("threads", "Active threads in a channel. { channel_id }", async ({ channel_id }) => api(`/channels/${channel_id}/threads/active`));
  await reg("create_channel", "{ guild_id, name, type?, topic? }", async ({ guild_id, ...rest }) => api(`/guilds/${guild_id}/channels`, { method: "POST", body: { type: 0, ...rest } }));
  await reg("create_thread", "{ channel_id, name, auto_archive_duration? }", async ({ channel_id, ...rest }) => api(`/channels/${channel_id}/threads`, { method: "POST", body: { auto_archive_duration: 1440, ...rest } }));
  await reg("add_role", "{ guild_id, user_id, role_id }", async ({ guild_id, user_id, role_id }) => api(`/guilds/${guild_id}/members/${user_id}/roles/${role_id}`, { method: "PUT" }));
  await reg("remove_role", "{ guild_id, user_id, role_id }", async ({ guild_id, user_id, role_id }) => api(`/guilds/${guild_id}/members/${user_id}/roles/${role_id}`, { method: "DELETE" }));
  await reg("ban", "{ guild_id, user_id, delete_message_days? }", async ({ guild_id, user_id, delete_message_days = 0, reason }) => api(`/guilds/${guild_id}/bans/${user_id}`, { method: "PUT", body: { delete_message_days, reason } }));
  await reg("kick", "{ guild_id, user_id }", async ({ guild_id, user_id }) => api(`/guilds/${guild_id}/members/${user_id}`, { method: "DELETE" }));
  await reg("scheduled_event_create", "{ guild_id, name, scheduled_start_time, entity_type=2, channel_id?, description?, privacy_level=2 }", async ({ guild_id, ...rest }) => api(`/guilds/${guild_id}/scheduled-events`, { method: "POST", body: { privacy_level: 2, entity_type: 2, ...rest } }));
  await reg("events", "{ guild_id }", async ({ guild_id }) => api(`/guilds/${guild_id}/scheduled-events`));
  await reg("members", "{ guild_id, limit? }", async ({ guild_id, limit = 100 }) => api(`/guilds/${guild_id}/members?limit=${Math.min(1000, limit)}`));

  await reg("autopilot_enable", "", async ({ on }) => { await passio.kv.set("autopilot_enabled", !!on); return { on: !!on }; });
  await reg("autopilot_dry_run", "", async ({ on }) => { await passio.kv.set("autopilot_dry_run", !!on); return { on: !!on }; });

  async function autopilotTick() {
    if ((await passio.kv.get("autopilot_enabled")) !== true) return { skipped: "off" };
    const dry = (await passio.kv.get("autopilot_dry_run")) !== false;
    const ch = await passio.kv.get("autopilot_channel");
    const msg = (await passio.kv.get("autopilot_daily_msg")) ?? "gm";
    const last = (await passio.kv.get("last_post_day")) ?? "";
    const today = new Date().toISOString().slice(0, 10);
    if (last === today) return { skipped: "already today" };
    if (!ch) return { skipped: "no channel" };
    if (dry) return { skipped: "dry-run", msg, ch };
    try {
      await api(`/channels/${ch}/messages`, { method: "POST", body: { content: msg } });
      await passio.kv.set("last_post_day", today);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  await reg("autopilot_tick", "", autopilotTick);
  passio.schedule({ id: "autopilot", every_seconds: 3600 }, () => autopilotTick().catch(() => undefined));
}
