export default async function init(passio) {
  const API = "2024-10";
  async function api(path, { method = "GET", body } = {}) {
    const shop = await passio.kv.get("shop");
    const tok = await passio.secrets.get("admin_token");
    if (!shop || !tok) throw new Error("set shop + admin_token");
    const r = await passio.net.fetch(`https://${shop}.myshopify.com/admin/api/${API}${path}`, {
      init: { method, headers: { "X-Shopify-Access-Token": tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined },
    });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`shopify ${r.status}: ${JSON.stringify(js).slice(0, 200)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("orders", "List orders. { status?, limit? }", async ({ status = "any", limit = 50 } = {}) => api(`/orders.json?status=${status}&limit=${Math.min(250, limit)}`));
  await reg("order", "{ id }", async ({ id }) => api(`/orders/${id}.json`));
  await reg("order_note", "{ id, note }", async ({ id, note }) => api(`/orders/${id}.json`, { method: "PUT", body: { order: { id, note } } }));
  await reg("order_fulfill", "{ id, location_id, tracking_number?, tracking_company? }", async ({ id, ...rest }) => api(`/fulfillments.json`, { method: "POST", body: { fulfillment: { order_id: id, ...rest } } }));
  await reg("order_refund", "{ id, amount?, reason? }", async ({ id, amount, reason }) => api(`/orders/${id}/refunds.json`, { method: "POST", body: { refund: { note: reason, shipping: { full_refund: !amount }, transactions: amount ? [{ amount, kind: "refund" }] : undefined } } }));
  await reg("customer", "{ id }", async ({ id }) => api(`/customers/${id}.json`));
  await reg("customer_search", "{ q }", async ({ q }) => api(`/customers/search.json?query=${encodeURIComponent(q)}`));
  await reg("product_list", "{ limit? }", async ({ limit = 50 } = {}) => api(`/products.json?limit=${Math.min(250, limit)}`));
  await reg("product_update", "{ id, ...fields }", async ({ id, ...rest }) => api(`/products/${id}.json`, { method: "PUT", body: { product: { id, ...rest } } }));
  await reg("inventory_set", "{ inventory_item_id, location_id, available }", async (body) => api(`/inventory_levels/set.json`, { method: "POST", body }));
  await reg("draft_order_create", "{ line_items, customer?, email? }", async (body) => api(`/draft_orders.json`, { method: "POST", body: { draft_order: body } }));
}
