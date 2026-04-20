export default async function init(passio) {
  const V = "v60.0";
  async function api(path, { method = "GET", body } = {}) {
    const base = await passio.kv.get("instance_url"); const tok = await passio.secrets.get("access_token");
    if (!base || !tok) throw new Error("set instance_url + access_token");
    const r = await passio.net.fetch(`${base}/services/data/${V}${path}`, { init: { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined } });
    const js = await r.json().catch(() => ({}));
    if (r.status >= 400) throw new Error(`sfdc ${r.status}: ${Array.isArray(js)?js[0]?.message:JSON.stringify(js).slice(0,200)}`);
    return js;
  }
  const reg = (n, d, x) => passio.tools.register({ name: n, description: d, execute: x });

  await reg("soql", "{ q }", async ({ q }) => api(`/query?q=${encodeURIComponent(q)}`));
  await reg("describe", "{ sobject }", async ({ sobject }) => api(`/sobjects/${sobject}/describe`));
  await reg("account", "{ id }", async ({ id }) => api(`/sobjects/Account/${id}`));
  await reg("account_update", "{ id, fields }", async ({ id, fields }) => api(`/sobjects/Account/${id}`, { method: "PATCH", body: fields }));
  await reg("opp_list", "{ account_id? }", async ({ account_id } = {}) => api(`/query?q=${encodeURIComponent(`SELECT Id,Name,StageName,Amount,CloseDate FROM Opportunity${account_id ? ` WHERE AccountId='${account_id}'` : ""} LIMIT 50`)}`));
  await reg("opp_create", "{ Name, StageName, CloseDate, Amount?, AccountId? }", async (body) => api(`/sobjects/Opportunity`, { method: "POST", body }));
  await reg("contact_upsert", "{ Email, fields }", async ({ Email, fields }) => api(`/sobjects/Contact/Email/${encodeURIComponent(Email)}`, { method: "PATCH", body: fields }));
  await reg("task_create", "{ Subject, Description?, WhoId?, WhatId?, ActivityDate? }", async (body) => api(`/sobjects/Task`, { method: "POST", body }));
}
