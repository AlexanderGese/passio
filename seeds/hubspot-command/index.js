export default async function init(passio) {
  async function api(path, { method = "GET", body } = {}) {
    const tok = await passio.secrets.get("access_token");
    if (!tok) throw new Error("set access_token");
    const r = await passio.net.fetch("https://api.hubapi.com" + path, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`hubspot ${r.status}: ${js.message ?? JSON.stringify(js).slice(0,160)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("contact_search", "{ query }", async ({ query }) => api("/crm/v3/objects/contacts/search", { method: "POST", body: { query, limit: 25 } }));
  await reg("contact_create", "{ email, firstname?, lastname? }", async (props) => api("/crm/v3/objects/contacts", { method: "POST", body: { properties: props } }));
  await reg("contact_update", "{ id, properties }", async ({ id, properties }) => api(`/crm/v3/objects/contacts/${id}`, { method: "PATCH", body: { properties } }));
  await reg("deal_list", "{ limit? }", async ({ limit = 25 } = {}) => api(`/crm/v3/objects/deals?limit=${limit}`));
  await reg("deal_create", "{ dealname, amount?, pipeline?, dealstage? }", async (props) => api("/crm/v3/objects/deals", { method: "POST", body: { properties: props } }));
  await reg("note_create", "{ objectId, objectType: 'contacts'|'deals', body }", async ({ objectId, objectType, body }) => {
    const note = await api("/crm/v3/objects/notes", { method: "POST", body: { properties: { hs_timestamp: Date.now(), hs_note_body: body } } });
    await api(`/crm/v3/objects/notes/${note.id}/associations/${objectType}/${objectId}/note_to_${objectType.slice(0, -1)}`, { method: "PUT" });
    return note;
  });
  await reg("engagement_list", "{ contactId }", async ({ contactId }) => api(`/crm/v3/objects/contacts/${contactId}/associations/notes`));
  await reg("email_draft", "{ to, subject, body }", async ({ to, subject, body }) => ({ to, subject, body, sent: false, note: "HubSpot transactional email requires single-send; this drafts only." }));
  await reg("task_create", "{ ownerId?, title, body?, due_ts? }", async (props) => api("/crm/v3/objects/tasks", { method: "POST", body: { properties: { hs_task_subject: props.title, hs_task_body: props.body, hs_timestamp: props.due_ts ?? Date.now(), hubspot_owner_id: props.ownerId } } }));
}
