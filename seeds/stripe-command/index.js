export default async function init(passio) {
  async function api(path, { method = "GET", form } = {}) {
    const tok = await passio.secrets.get("secret_key");
    if (!tok) throw new Error("set secret_key");
    const headers = { Authorization: "Bearer " + tok };
    let body;
    if (form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = flatten(form);
    }
    const r = await passio.net.fetch("https://api.stripe.com/v1" + path, { init: { method, headers, body } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`stripe ${r.status}: ${js.error?.message ?? r.status}`);
    return js;
  }
  function flatten(obj, prefix = "", out = new URLSearchParams()) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach((item, i) => flatten(item, `${key}[${i}]`, out));
      else if (typeof v === "object") flatten(v, key, out);
      else out.append(key, String(v));
    }
    return out;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("charge_list", "{ limit? }", async ({ limit = 20 } = {}) => api(`/charges?limit=${limit}`));
  await reg("charge", "{ id }", async ({ id }) => api(`/charges/${id}`));
  await reg("refund", "{ charge, amount?, reason? }", async (form) => api("/refunds", { method: "POST", form }));
  await reg("customer_search", "{ query }", async ({ query }) => api("/customers/search?query=" + encodeURIComponent(query)));
  await reg("customer_create", "{ email, name? }", async (form) => api("/customers", { method: "POST", form }));
  await reg("invoice_create", "{ customer, auto_advance?, collection_method?, days_until_due?, line_items? }", async ({ line_items, ...rest }) => {
    const inv = await api("/invoices", { method: "POST", form: rest });
    for (const li of line_items ?? []) await api("/invoiceitems", { method: "POST", form: { ...li, invoice: inv.id } });
    return inv;
  });
  await reg("invoice_send", "{ id }", async ({ id }) => api(`/invoices/${id}/send`, { method: "POST" }));
  await reg("invoice_void", "{ id }", async ({ id }) => api(`/invoices/${id}/void`, { method: "POST" }));
  await reg("sub_list", "{ customer?, status? }", async (form) => api("/subscriptions?" + flatten(form).toString()));
  await reg("sub_cancel", "{ id }", async ({ id }) => api(`/subscriptions/${id}`, { method: "DELETE" }));
  await reg("sub_pause", "{ id, behavior? }", async ({ id, behavior = "void" }) => api(`/subscriptions/${id}`, { method: "POST", form: { pause_collection: { behavior } } }));
  await reg("dispute_list", "{ limit? }", async ({ limit = 20 } = {}) => api(`/disputes?limit=${limit}`));
  await reg("payout_list", "{ limit? }", async ({ limit = 20 } = {}) => api(`/payouts?limit=${limit}`));
  await reg("balance", "", async () => api("/balance"));
}
