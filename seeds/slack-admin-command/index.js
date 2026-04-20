export default async function init(passio) {
  async function api(method, body) {
    const tok = await passio.secrets.get("token");
    if (!tok) throw new Error("set token");
    const r = await passio.net.fetch("https://slack.com/api/" + method, {
      init: {
        method: "POST",
        headers: { Authorization: "Bearer " + tok, "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(body ?? {}),
      },
    });
    const js = await r.json();
    if (!js.ok) throw new Error(`slack ${method}: ${js.error}`);
    return js;
  }
  const reg = (name, description, execute) => passio.tools.register({ name, description, execute });

  await reg("post", "{ channel, text, blocks? }", async (p) => api("chat.postMessage", p));
  await reg("post_thread", "{ channel, thread_ts, text }", async (p) => api("chat.postMessage", p));
  await reg("dm", "{ user, text }", async ({ user, text }) => {
    const open = await api("conversations.open", { users: user });
    return api("chat.postMessage", { channel: open.channel.id, text });
  });
  await reg("react", "{ channel, timestamp, name }", async (p) => api("reactions.add", p));
  await reg("list_channels", "", async () => api("conversations.list", { types: "public_channel,private_channel", limit: 200 }));
  await reg("create_channel", "{ name, is_private? }", async (p) => api("conversations.create", { name: p.name, is_private: !!p.is_private }));
  await reg("invite", "{ channel, users }", async (p) => api("conversations.invite", p));
  await reg("reminder_add", "{ text, time }", async (p) => api("reminders.add", p));
  await reg("reminder_list", "", async () => api("reminders.list", {}));
  await reg("set_status", "{ status_text, status_emoji?, status_expiration? }", async (p) => api("users.profile.set", { profile: p }));
  await reg("history", "{ channel, limit? }", async ({ channel, limit = 20 }) => api("conversations.history", { channel, limit }));
  await reg("search", "{ query, count? }", async (p) => api("search.messages", p));
  await reg("delete", "{ channel, ts }", async (p) => api("chat.delete", p));
}
