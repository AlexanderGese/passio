/**
 * github-command — full GitHub remote (REST v3).
 * Licensed paid seed. Bearer auth via fine-grained PAT.
 */
const RECENT = "recent_actions";

export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const tok = await passio.secrets.get("gh_token");
    if (!tok) throw new Error("set gh_token in Settings");
    const r = await passio.net.fetch("https://api.github.com" + path, {
      init: {
        method,
        headers: {
          Authorization: "Bearer " + tok,
          Accept: "application/vnd.github+json",
          "User-Agent": "passio-github-command/0.1",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`gh ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return { status: r.status, body: js };
  }

  const recent = async (e) => {
    const l = (await passio.kv.get(RECENT)) ?? [];
    l.unshift({ ...e, ts: Date.now() });
    while (l.length > 100) l.pop();
    await passio.kv.set(RECENT, l);
  };

  await passio.tools.register({ name: "me", execute: async () => (await api("/user")).body });
  await passio.tools.register({
    name: "search_issues",
    description: "GitHub issue search. { q }",
    input: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    execute: async ({ q }) => (await api("/search/issues?q=" + encodeURIComponent(q))).body,
  });

  await passio.tools.register({
    name: "issue_create",
    description: "Create an issue. { owner, repo, title, body?, labels? }",
    input: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" }, body: { type: "string" }, labels: { type: "array" } }, required: ["owner", "repo", "title"] },
    execute: async ({ owner, repo, title, body, labels }) => {
      const { body: res } = await api(`/repos/${owner}/${repo}/issues`, { method: "POST", body: { title, body, labels } });
      await recent({ kind: "issue", url: res.html_url });
      return { ok: true, url: res.html_url, number: res.number };
    },
  });
  await passio.tools.register({
    name: "issue_comment",
    description: "Comment on an issue or PR. { owner, repo, number, body }",
    execute: async ({ owner, repo, number, body }) => {
      await api(`/repos/${owner}/${repo}/issues/${number}/comments`, { method: "POST", body: { body } });
      await recent({ kind: "comment", number });
      return { ok: true };
    },
  });
  await passio.tools.register({
    name: "issue_close",
    execute: async ({ owner, repo, number }) => { await api(`/repos/${owner}/${repo}/issues/${number}`, { method: "PATCH", body: { state: "closed" } }); return { ok: true }; },
  });
  await passio.tools.register({
    name: "issue_reopen",
    execute: async ({ owner, repo, number }) => { await api(`/repos/${owner}/${repo}/issues/${number}`, { method: "PATCH", body: { state: "open" } }); return { ok: true }; },
  });

  await passio.tools.register({
    name: "pr_review",
    description: "Approve / request changes / comment on a PR. { owner, repo, number, event: APPROVE|REQUEST_CHANGES|COMMENT, body? }",
    execute: async ({ owner, repo, number, event, body }) => {
      await api(`/repos/${owner}/${repo}/pulls/${number}/reviews`, { method: "POST", body: { event, body } });
      await recent({ kind: "review", number, event });
      return { ok: true };
    },
  });
  await passio.tools.register({
    name: "pr_merge",
    description: "Merge a PR. { owner, repo, number, method?: merge|squash|rebase }",
    execute: async ({ owner, repo, number, method = "squash" }) => {
      const { body } = await api(`/repos/${owner}/${repo}/pulls/${number}/merge`, { method: "PUT", body: { merge_method: method } });
      return { ok: body?.merged === true, sha: body?.sha };
    },
  });
  await passio.tools.register({
    name: "pr_request_reviewers",
    execute: async ({ owner, repo, number, reviewers }) => { await api(`/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, { method: "POST", body: { reviewers } }); return { ok: true }; },
  });

  await passio.tools.register({
    name: "release_create",
    description: "Create a release. { owner, repo, tag_name, name?, body?, draft?, prerelease? }",
    execute: async ({ owner, repo, ...rest }) => {
      const { body } = await api(`/repos/${owner}/${repo}/releases`, { method: "POST", body: rest });
      return { ok: true, url: body.html_url };
    },
  });

  await passio.tools.register({
    name: "repo_create",
    description: "Create a repo on your user account. { name, private?, description? }",
    execute: async ({ name, ...rest }) => { const { body } = await api("/user/repos", { method: "POST", body: { name, ...rest } }); return { ok: true, url: body.html_url }; },
  });
  await passio.tools.register({
    name: "repo_visibility",
    execute: async ({ owner, repo, private: priv }) => { await api(`/repos/${owner}/${repo}`, { method: "PATCH", body: { private: priv } }); return { ok: true }; },
  });

  await passio.tools.register({ name: "star", execute: async ({ owner, repo }) => { await api(`/user/starred/${owner}/${repo}`, { method: "PUT" }); return { ok: true }; } });
  await passio.tools.register({ name: "unstar", execute: async ({ owner, repo }) => { await api(`/user/starred/${owner}/${repo}`, { method: "DELETE" }); return { ok: true }; } });

  await passio.tools.register({ name: "notifications", execute: async () => (await api("/notifications")).body });
  await passio.tools.register({ name: "mark_notifications_read", execute: async () => { await api("/notifications", { method: "PUT", body: { read: true } }); return { ok: true }; } });

  await passio.tools.register({
    name: "file_read",
    description: "Read a file from a repo. { owner, repo, path, ref? }",
    execute: async ({ owner, repo, path, ref }) => {
      const r = await api(`/repos/${owner}/${repo}/contents/${path}${ref ? "?ref=" + ref : ""}`);
      const decoded = r.body?.content ? Buffer.from(r.body.content, "base64").toString("utf8") : null;
      return { content: decoded, sha: r.body?.sha };
    },
  });
  await passio.tools.register({
    name: "file_write",
    description: "Create or update a file. { owner, repo, path, content, message, branch?, sha? }",
    execute: async ({ owner, repo, path, content, message, branch, sha }) => {
      const body = { message, content: Buffer.from(content).toString("base64"), branch, sha };
      const { body: res } = await api(`/repos/${owner}/${repo}/contents/${path}`, { method: "PUT", body });
      return { ok: true, commit: res?.commit?.sha };
    },
  });

  await passio.tools.register({
    name: "gist_create",
    description: "Create a gist. { description, public, files: { filename: { content } } }",
    execute: async (input) => { const { body } = await api("/gists", { method: "POST", body: input }); return { url: body.html_url }; },
  });

  await passio.tools.register({ name: "recent_actions", execute: async () => ({ items: (await passio.kv.get(RECENT)) ?? [] }) });

  // Autopilot: nightly, auto-triage stale issues (label `stale` if untouched 30 days)
  await passio.tools.register({ name: "autopilot_enable", execute: async ({ on }) => { await passio.kv.set("autopilot_enabled", !!on); return { on: !!on }; } });
  await passio.tools.register({ name: "autopilot_dry_run", execute: async ({ on }) => { await passio.kv.set("autopilot_dry_run", !!on); return { on: !!on }; } });

  async function autopilotTick() {
    if ((await passio.kv.get("autopilot_enabled")) !== true) return { skipped: "off" };
    const dry = (await passio.kv.get("autopilot_dry_run")) !== false;
    const repos = String((await passio.kv.get("autopilot_repos")) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const actions = [];
    for (const repo of repos) {
      const [owner, name] = repo.split("/");
      if (!owner || !name) continue;
      try {
        const { body: r } = await api(`/repos/${owner}/${name}/issues?state=open&sort=updated&direction=asc&per_page=10`);
        for (const i of r ?? []) {
          const ageDays = (Date.now() - new Date(i.updated_at).getTime()) / 86400_000;
          if (ageDays > 30 && !(i.labels ?? []).some((l) => l.name === "stale")) {
            actions.push({ repo, number: i.number, title: i.title });
            if (!dry) {
              await api(`/repos/${owner}/${name}/issues/${i.number}/labels`, { method: "POST", body: { labels: ["stale"] } });
            }
          }
        }
      } catch {}
    }
    return { dry, actions };
  }
  await passio.tools.register({ name: "autopilot_tick", execute: autopilotTick });
  passio.schedule({ id: "autopilot", every_seconds: 3600 }, () => autopilotTick().catch(() => undefined));
}
