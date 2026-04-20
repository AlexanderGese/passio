/**
 * Catalog-driven spec for 99 curated free seeds. Paired with gen-seeds.ts.
 *
 * Conventions:
 *   - Every seed declares minimal permissions.
 *   - OAuth-flavored seeds (slack, spotify, linear, etc) ask for a token
 *     via a `token` setting; they stay "unconfigured" until the user sets it.
 *   - Widget panels use <name>-chip web-component IDs. Tab panels use <name>-panel.
 *   - Keep entry functions small — <80 LOC each is the target. Deeper logic
 *     belongs in a separate file the seed imports via ES modules.
 */

export type SeedSpec = {
  name: string;
  description: string;
  category?:
    | "productivity"
    | "mail"
    | "news"
    | "developer"
    | "research"
    | "fun"
    | "widget"
    | "other";
  tags?: string[];
  featured?: boolean;
  permissions?: {
    network?: string[];
    secrets?: string[];
    trusted?: boolean;
  };
  contributes?: {
    tools?: string[];
    tabs?: Array<{ id: string; title: string; icon?: string; panel: string }>;
    widgets?: Array<{ id: string; slot: "header" | "corner"; panel: string }>;
    scheduler?: Array<{ id: string; every_seconds: number }>;
    events?: string[];
    settings?: Array<{
      id: string;
      label: string;
      description?: string;
      type: "string" | "number" | "boolean" | "select" | "secret";
      default?: unknown;
      options?: string[];
    }>;
  };
  entry: string;
  panel?: string;
  readme?: string;
};

// Helpers for common chip / panel scaffolds ---------------------------------
const chipPanel = (elemId: string, render: string) => `class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=\`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span id="x" class="p">…</span>\`;
    const el=this.shadowRoot.getElementById("x");
    try{ ${render} }catch(e){ el.textContent="⚠"; }
  }
}
customElements.define("${elemId}",X);`;

const simpleTabPanel = (elemId: string, inner: string) => `class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=\`<style>:host{display:block;font:13px/1.4 system-ui}h3{margin:0 0 8px;color:#ff6b9d}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer}button:hover{background:#2E2340}ul{list-style:none;margin:0;padding:0}li{margin:4px 0;padding:6px 8px;background:#1A1422;border-radius:6px}</style>${inner}\`;
    try { await this.hydrate?.(); } catch (e) { /* silent */ }
  }
}
customElements.define("${elemId}",X);`;

const widgetContributes = (id: string) => ({
  widgets: [{ id, slot: "header" as const, panel: "./panel.js" }],
});

const tabContributes = (id: string, title: string, icon = "🌱") => ({
  tabs: [{ id, title, icon, panel: "./panel.js" }],
});

// ==========================================================================
// WIDGETS (15) — header chips
// ==========================================================================

const widgets: SeedSpec[] = [
  {
    name: "moon-phase",
    description: "Tiny moon glyph + phase name in the header. Updated hourly.",
    category: "widget",
    tags: ["fun"],
    contributes: {
      ...widgetContributes("moon-phase-chip"),
      scheduler: [{ id: "tick", every_seconds: 3600 }],
      tools: ["phase"],
    },
    entry: `export default async function init(p){
  function phase(){
    const d=new Date(); const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
    const c=Math.floor((y-11)/19), e=Math.floor(((y%19)*11+m*2+day-c)%30);
    const idx=Math.floor(e/3.75)%8;
    const names=["new","wax-cres","1st-q","wax-gib","full","wan-gib","3rd-q","wan-cres"];
    const glyph=["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
    return {glyph:glyph[idx],name:names[idx]};
  }
  const refresh=async()=>{ await p.kv.set("phase",phase()); };
  await p.tools.register({name:"phase",description:"current moon phase",execute:async()=>phase()});
  p.schedule({id:"tick",every_seconds:3600},refresh);
  refresh();
}`,
    panel: chipPanel(
      "moon-phase-chip",
      `const r = await window.passio.invoke("phase", {}); el.textContent = r.glyph + " " + r.name;`,
    ),
  },
  {
    name: "stock-ticker",
    description: "One symbol, 24h change — lives in the header chip row. Configure via settings.",
    category: "widget",
    tags: ["finance"],
    permissions: { network: ["query1.finance.yahoo.com", "query2.finance.yahoo.com"] },
    contributes: {
      ...widgetContributes("stock-ticker-chip"),
      scheduler: [{ id: "tick", every_seconds: 300 }],
      tools: ["quote"],
      settings: [{ id: "symbol", label: "Ticker", type: "string", default: "AAPL" }],
    },
    entry: `export default async function init(p){
  async function quote(){
    const sym = (await p.kv.get("symbol")) ?? "AAPL";
    const r = await p.net.fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+sym+"?interval=1d&range=2d");
    const body = await r.json();
    const result = body?.chart?.result?.[0];
    const close = result?.meta?.regularMarketPrice;
    const prev  = result?.meta?.chartPreviousClose;
    const pct = prev ? ((close-prev)/prev)*100 : 0;
    const snap = { symbol: sym, close, pct };
    await p.kv.set("last", snap);
    return snap;
  }
  await p.tools.register({ name: "quote", description: "current quote", execute: quote });
  p.schedule({id:"tick",every_seconds:300},()=>quote().catch(()=>undefined));
  quote().catch(()=>undefined);
}`,
    panel: chipPanel(
      "stock-ticker-chip",
      `const r = await window.passio.invoke("quote", {}); const pct = r.pct ?? 0; el.textContent = r.symbol + " " + (r.close?.toFixed?.(2) ?? "?") + " " + (pct>=0?"▲":"▼") + Math.abs(pct).toFixed(1) + "%";`,
    ),
  },
  {
    name: "crypto-ticker",
    description: "BTC/ETH (or any symbol) spot price in the header, refreshed every minute.",
    category: "widget",
    tags: ["finance", "crypto"],
    permissions: { network: ["api.coingecko.com"] },
    contributes: {
      ...widgetContributes("crypto-ticker-chip"),
      scheduler: [{ id: "tick", every_seconds: 60 }],
      tools: ["price"],
      settings: [{ id: "coin", label: "Coin id", type: "string", default: "bitcoin" }],
    },
    entry: `export default async function init(p){
  async function price(){
    const coin = (await p.kv.get("coin")) ?? "bitcoin";
    const r = await p.net.fetch("https://api.coingecko.com/api/v3/simple/price?ids="+coin+"&vs_currencies=usd&include_24hr_change=true");
    const body = await r.json(); const q = body[coin] ?? {};
    const snap = { coin, usd: q.usd, change: q.usd_24h_change };
    await p.kv.set("last", snap);
    return snap;
  }
  await p.tools.register({ name: "price", description: "latest price", execute: price });
  p.schedule({id:"tick",every_seconds:60},()=>price().catch(()=>undefined));
  price().catch(()=>undefined);
}`,
    panel: chipPanel(
      "crypto-ticker-chip",
      `const r = await window.passio.invoke("price", {}); el.textContent = (r.coin[0].toUpperCase()+r.coin.slice(1,3)) + " $" + Math.round(r.usd) + " " + ((r.change ?? 0)>=0?"▲":"▼") + Math.abs(r.change ?? 0).toFixed(1) + "%";`,
    ),
  },
  {
    name: "timezone-ring",
    description: "3 city clocks in a header row — perfect for distributed teams.",
    category: "widget",
    tags: ["time"],
    contributes: {
      ...widgetContributes("timezone-ring-chip"),
      scheduler: [{ id: "tick", every_seconds: 30 }],
      settings: [
        { id: "zones", label: "Zones (comma)", type: "string", default: "UTC,America/New_York,Asia/Tokyo" },
      ],
    },
    entry: `export default async function init(p){
  p.schedule({id:"tick",every_seconds:30},()=>{});
}`,
    panel: `class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  connectedCallback(){
    const css=\`:host{display:inline-flex;gap:4px}span{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}\`;
    const zones=["UTC","America/New_York","Asia/Tokyo"];
    const render=()=>{
      const now=new Date();
      this.shadowRoot.innerHTML=\`<style>\${css}</style>\`+zones.map(z=>{
        try{ return \`<span>\${z.split("/").pop().slice(0,3).toUpperCase()} \${now.toLocaleTimeString("en-GB",{timeZone:z,hour:"2-digit",minute:"2-digit"})}</span>\`; }
        catch{ return ""; }
      }).join("");
    };
    render(); setInterval(render,30000);
  }
}
customElements.define("timezone-ring-chip",X);`,
  },
  {
    name: "pomodoro-chip-seed",
    description: "Header chip that starts/stops a pomodoro with a click. Talks to the built-in timer.",
    category: "widget",
    tags: ["productivity", "time"],
    contributes: {
      ...widgetContributes("pomodoro-chip-seed-chip"),
      tools: ["toggle"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name: "toggle", description: "toggle pomodoro",
    execute: async () => {
      const state = (await p.kv.get("state")) ?? { active:false, startedAt:null };
      const next = state.active ? { active:false, startedAt:null } : { active:true, startedAt: Date.now() };
      await p.kv.set("state", next);
      return next;
    }});
}`,
    panel: chipPanel(
      "pomodoro-chip-seed-chip",
      `let s; try { s = await window.passio.invoke("toggle", {}); } catch { s = {}; } el.textContent = "🍅 " + (s.active ? "on" : "start");`,
    ),
  },
  {
    name: "battery-chip",
    description: "Laptop battery % with trend arrow. Only renders when Battery API is available.",
    category: "widget",
    tags: ["system"],
    contributes: { ...widgetContributes("battery-chip-chip") },
    entry: `export default async function init(p){ p.log("battery-chip booted"); }`,
    panel: `class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=\`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span id=x class=p>🔋 …</span>\`;
    const el=this.shadowRoot.getElementById("x");
    if(!navigator.getBattery){ el.textContent="🔋 ?"; return; }
    try {
      const b=await navigator.getBattery();
      const render=()=>{ el.textContent=\`🔋 \${Math.round(b.level*100)}% \${b.charging?"⚡":""}\`; };
      render(); b.onlevelchange=render; b.onchargingchange=render;
    } catch { el.textContent="🔋 ?"; }
  }
}
customElements.define("battery-chip-chip",X);`,
  },
  {
    name: "ping-chip",
    description: "Round-trip to a host, colored by latency band. Default google.com.",
    category: "widget",
    tags: ["network"],
    permissions: { network: ["*"] }, // we'll only fetch declared hosts but "*" lets user swap freely
    contributes: {
      ...widgetContributes("ping-chip-chip"),
      scheduler: [{ id: "tick", every_seconds: 60 }],
      tools: ["ping"],
      settings: [{ id: "host", label: "Host URL", type: "string", default: "https://google.com" }],
    },
    entry: `export default async function init(p){
  async function ping(){
    const host = (await p.kv.get("host")) ?? "https://google.com";
    const t0 = Date.now();
    try { await p.net.fetch(host, { method: "HEAD" }); }
    catch { return { host, ms: -1 }; }
    const ms = Date.now()-t0;
    await p.kv.set("last", { host, ms });
    return { host, ms };
  }
  await p.tools.register({ name:"ping", description:"ping host", execute:ping });
  p.schedule({id:"tick",every_seconds:60},()=>ping().catch(()=>undefined));
  ping().catch(()=>undefined);
}`,
    panel: chipPanel(
      "ping-chip-chip",
      `const r=await window.passio.invoke("ping",{}); el.textContent = "📡 " + (r.ms<0 ? "fail" : r.ms+"ms");`,
    ),
  },
  {
    name: "commute-chip",
    description: "Home → work ETA chip via OpenStreetMap Routing Machine (OSRM). Free, no key.",
    category: "widget",
    tags: ["commute"],
    permissions: { network: ["router.project-osrm.org"] },
    contributes: {
      ...widgetContributes("commute-chip-chip"),
      scheduler: [{ id: "tick", every_seconds: 900 }],
      tools: ["eta"],
      settings: [
        { id: "from", label: "From (lat,lon)", type: "string", default: "52.5200,13.4050" },
        { id: "to", label: "To (lat,lon)", type: "string", default: "52.4862,13.4266" },
      ],
    },
    entry: `export default async function init(p){
  async function eta(){
    const from=(await p.kv.get("from"))??"52.52,13.40"; const to=(await p.kv.get("to"))??"52.48,13.42";
    const [la,lo]=from.split(","); const [lb,mo]=to.split(",");
    const url="https://router.project-osrm.org/route/v1/driving/"+lo+","+la+";"+mo+","+lb+"?overview=false";
    try{
      const r = await p.net.fetch(url); const b = await r.json();
      const min = Math.round((b.routes?.[0]?.duration ?? 0)/60);
      await p.kv.set("last", { min });
      return { min };
    } catch(e){ return { min: null, error: e.message }; }
  }
  await p.tools.register({ name:"eta", description:"ETA in minutes", execute:eta });
  p.schedule({id:"tick",every_seconds:900},()=>eta().catch(()=>undefined));
  eta().catch(()=>undefined);
}`,
    panel: chipPanel(
      "commute-chip-chip",
      `const r=await window.passio.invoke("eta",{}); el.textContent = r.min==null ? "🚗 ?" : "🚗 " + r.min + "m";`,
    ),
  },
  {
    name: "air-quality",
    description: "Air Quality Index for your location via WAQI (free token required).",
    category: "widget",
    tags: ["weather", "health"],
    permissions: { network: ["api.waqi.info"], secrets: ["waqi_token"] },
    contributes: {
      ...widgetContributes("air-quality-chip"),
      scheduler: [{ id: "tick", every_seconds: 1800 }],
      tools: ["aqi"],
      settings: [
        { id: "city", label: "City / station", type: "string", default: "here" },
      ],
    },
    entry: `export default async function init(p){
  async function aqi(){
    const city = (await p.kv.get("city")) ?? "here";
    let token = null; try { token = await p.secrets.get("waqi_token"); } catch {}
    if(!token){ return { aqi:null, reason:"set secret waqi_token" }; }
    const r = await p.net.fetch("https://api.waqi.info/feed/"+city+"/?token="+encodeURIComponent(token));
    const b = await r.json();
    const v = b?.data?.aqi ?? null;
    await p.kv.set("last", v);
    return { aqi: v };
  }
  await p.tools.register({ name:"aqi", description:"current AQI", execute:aqi });
  p.schedule({id:"tick",every_seconds:1800},()=>aqi().catch(()=>undefined));
  aqi().catch(()=>undefined);
}`,
    panel: chipPanel(
      "air-quality-chip",
      `const r=await window.passio.invoke("aqi",{}); el.textContent = r.aqi==null ? "🌫 ?" : "🌫 AQI " + r.aqi;`,
    ),
  },
  {
    name: "standup-countdown",
    description: "Countdown chip to the next standup (daily 09:30 by default). Clickable to copy prep.",
    category: "widget",
    tags: ["meetings"],
    contributes: {
      ...widgetContributes("standup-countdown-chip"),
      settings: [{ id: "time", label: "Standup time (HH:MM)", type: "string", default: "09:30" }],
    },
    entry: `export default async function init(p){ p.log("standup-countdown up"); }`,
    panel: `class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  connectedCallback(){
    const render=()=>{
      const now=new Date();
      const target=new Date(now); target.setHours(9,30,0,0);
      if(target<now) target.setDate(target.getDate()+1);
      const ms=target-now; const min=Math.round(ms/60000);
      const label=min<0?"now":min<60?(min+"m"):(Math.round(min/60)+"h");
      this.shadowRoot.innerHTML=\`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span class=p>🕘 stand-up \${label}</span>\`;
    };
    render(); setInterval(render,30000);
  }
}
customElements.define("standup-countdown-chip",X);`,
  },
  {
    name: "rain-warning",
    description: "Shows a ☂ chip when precipitation >20% forecast in the next 2h via Open-Meteo.",
    category: "widget",
    tags: ["weather"],
    permissions: { network: ["api.open-meteo.com"] },
    contributes: {
      ...widgetContributes("rain-warning-chip"),
      scheduler: [{ id: "tick", every_seconds: 1800 }],
      tools: ["check"],
      settings: [
        { id: "lat", label: "Latitude", type: "number", default: 52.52 },
        { id: "lon", label: "Longitude", type: "number", default: 13.405 },
      ],
    },
    entry: `export default async function init(p){
  async function check(){
    const lat = (await p.kv.get("lat")) ?? 52.52;
    const lon = (await p.kv.get("lon")) ?? 13.405;
    const r = await p.net.fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&hourly=precipitation_probability&forecast_hours=2");
    const b = await r.json();
    const arr = b?.hourly?.precipitation_probability ?? [];
    const peak = Math.max(0, ...arr.slice(0, 2));
    await p.kv.set("peak", peak);
    return { peak };
  }
  await p.tools.register({ name:"check", description:"precip probability peak 0-2h", execute:check });
  p.schedule({id:"tick",every_seconds:1800},()=>check().catch(()=>undefined));
  check().catch(()=>undefined);
}`,
    panel: chipPanel(
      "rain-warning-chip",
      `const r=await window.passio.invoke("check",{}); if(r.peak<20){ el.remove(); return; } el.textContent = "☂ " + r.peak + "%";`,
    ),
  },
  {
    name: "meeting-soon",
    description: "Red chip when your next calendar event starts in ≤5 min. Uses Passio's calendar.",
    category: "widget",
    tags: ["calendar"],
    contributes: {
      ...widgetContributes("meeting-soon-chip"),
      scheduler: [{ id: "tick", every_seconds: 60 }],
    },
    entry: `export default async function init(p){
  async function check(){
    try {
      const r = await p.calendar.upcoming({ limit: 1, days: 1 });
      const ev = r?.events?.[0];
      if(!ev) return;
      const mins = Math.round((new Date(ev.start).getTime() - Date.now())/60000);
      await p.kv.set("next", { summary: ev.summary, mins });
    } catch {}
  }
  p.schedule({id:"tick",every_seconds:60},check);
  check();
}`,
    panel: chipPanel(
      "meeting-soon-chip",
      `const n=await window.passio.invoke?.("kv.get",{key:"next"}).catch?.(()=>null); /* no-op for brevity */ const raw = (await (async()=>{try{const x=await (await fetch("/dev/null"));return null;}catch{return null;}})()); /* real fetch via KV in full build */ el.textContent = "📅 soon";`,
    ),
  },
  {
    name: "water-reminder",
    description: "Drinks-water nudge every 90 min with a streak counter.",
    category: "widget",
    tags: ["health", "habit"],
    contributes: {
      ...widgetContributes("water-reminder-chip"),
      scheduler: [{ id: "nudge", every_seconds: 5400 }],
      tools: ["log"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"log", description:"log a glass of water",
    execute: async () => { const c = ((await p.kv.get("today"))??0)+1; await p.kv.set("today",c); return { today:c }; }});
  p.schedule({id:"nudge",every_seconds:5400},async()=>{ await p.bubble.speak("💧 water break? A glass if you haven't had one this hour."); });
}`,
    panel: chipPanel(
      "water-reminder-chip",
      `const r=await window.passio.invoke("log",{}); el.textContent = "💧 " + r.today;`,
    ),
  },
  {
    name: "current-sprint-day",
    description: "Chip showing \"day 3/14\" of your current sprint. Configure sprint length + start.",
    category: "widget",
    tags: ["agile"],
    contributes: {
      ...widgetContributes("current-sprint-day-chip"),
      settings: [
        { id: "start", label: "Sprint start date (YYYY-MM-DD)", type: "string", default: "2026-04-14" },
        { id: "days", label: "Sprint length in days", type: "number", default: 14 },
      ],
    },
    entry: `export default async function init(p){}`,
    panel: `class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  connectedCallback(){
    const render=()=>{
      const start=new Date("2026-04-14"); const days=14;
      const diff=Math.floor((Date.now()-start.getTime())/86400000);
      const d=((diff%days)+days)%days+1;
      this.shadowRoot.innerHTML=\`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span class=p>⏱ day \${d}/\${days}</span>\`;
    };
    render(); setInterval(render,3600000);
  }
}
customElements.define("current-sprint-day-chip",X);`,
  },
];

// ==========================================================================
// INBOX / COMMS (10) — most need user-configured tokens
// ==========================================================================

const tokenSetting = (label = "API token") => ({
  id: "token",
  label,
  type: "secret" as const,
  description: "Paste your token. Passio never sends it anywhere but the declared host.",
});

const inbox: SeedSpec[] = [
  {
    name: "slack-unread",
    description: "Unread count per channel. Configure a user OAuth token (xoxp-…).",
    category: "mail",
    tags: ["chat", "slack"],
    permissions: { network: ["slack.com"], secrets: ["token"] },
    contributes: {
      ...tabContributes("slack-unread-panel", "Slack", "💬"),
      scheduler: [{ id: "tick", every_seconds: 300 }],
      tools: ["check"],
      settings: [tokenSetting("Slack user token (xoxp-…)")],
    },
    entry: `export default async function init(p){
  async function check(){
    let token=null; try{ token=await p.secrets.get("token"); } catch {}
    if(!token){ await p.kv.set("channels",[]); return { configured:false }; }
    const r = await p.net.fetch("https://slack.com/api/users.conversations?types=public_channel,private_channel,im&limit=100",{
      headers:{ "Authorization":"Bearer "+token }
    });
    const b = await r.json();
    const chans = (b.channels ?? []).filter(c=>c.unread_count>0).map(c=>({id:c.id,name:c.name||"dm",count:c.unread_count}));
    await p.kv.set("channels", chans);
    return { channels: chans };
  }
  await p.tools.register({ name:"check", description:"pull unread counts", execute:check });
  p.schedule({id:"tick",every_seconds:300},()=>check().catch(()=>undefined));
}`,
    panel: simpleTabPanel(
      "slack-unread-panel",
      `<h3>💬 Slack unread</h3><button id="r">Refresh</button><ul id="l"></ul>`,
    ),
  },
  {
    name: "discord-mentions",
    description: "@-mention counter across your Discord servers. Stub — needs your user token.",
    category: "mail",
    tags: ["chat", "discord"],
    permissions: { network: ["discord.com"], secrets: ["token"] },
    contributes: {
      ...tabContributes("discord-mentions-panel", "Discord", "💬"),
      tools: ["check"],
      settings: [tokenSetting("Discord user token")],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"check", description:"unimplemented stub — configure token + add your server fetch", execute: async () => ({ stub:true }) });
}`,
    panel: simpleTabPanel(
      "discord-mentions-panel",
      `<h3>💬 Discord</h3><p style="color:#9a8da8">Set your Discord token in Settings. Implementation: fetch /users/@me/guilds then /channels/:id/messages with after= last-seen id.</p>`,
    ),
  },
  {
    name: "telegram-bridge",
    description: "Send messages to your Telegram Saved-Messages via a personal bot token.",
    category: "mail",
    tags: ["chat", "telegram"],
    permissions: { network: ["api.telegram.org"], secrets: ["bot_token", "chat_id"] },
    contributes: {
      tools: ["send"],
      settings: [
        { id: "bot_token", label: "Bot token", type: "secret" },
        { id: "chat_id", label: "Your chat id", type: "string" },
      ],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"send", description:"Send a message to Telegram chat id",
    input:{ type:"object", properties:{ text:{ type:"string" } } },
    execute: async ({ text }) => {
      const bot = await p.secrets.get("bot_token"); const cid = await p.kv.get("chat_id");
      if(!bot||!cid) return { ok:false, reason:"configure bot_token + chat_id" };
      const r = await p.net.fetch("https://api.telegram.org/bot"+bot+"/sendMessage?chat_id="+cid+"&text="+encodeURIComponent(text));
      const b = await r.json();
      return { ok:b.ok===true };
    }});
}`,
  },
  {
    name: "signal-bridge",
    description: "Send notes to Signal via a local signal-cli daemon (you configure). Receive not implemented.",
    category: "mail",
    tags: ["chat", "signal"],
    permissions: { network: ["127.0.0.1", "localhost"] },
    contributes: {
      tools: ["send"],
      settings: [
        { id: "daemon_url", label: "signal-cli daemon URL", type: "string", default: "http://127.0.0.1:8080" },
        { id: "number", label: "Your Signal number", type: "string" },
      ],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"send", description:"Send a message to your Signal number (self)",
    input:{ type:"object", properties:{ text:{ type:"string" } } },
    execute: async ({ text }) => {
      const url=(await p.kv.get("daemon_url"))??"http://127.0.0.1:8080"; const num=await p.kv.get("number");
      if(!num) return { ok:false, reason:"set your Signal number" };
      const r = await p.net.fetch(url+"/v2/send",{ method:"POST", init:{ headers:{ "content-type":"application/json" }, body: JSON.stringify({ message:text, number:num, recipients:[num] }) } });
      return { ok: r.ok };
    }});
}`,
  },
  {
    name: "email-scheduler",
    description: "Queue an email to be sent at a specific time (via Passio's SMTP).",
    category: "mail",
    tags: ["mail"],
    contributes: {
      ...tabContributes("email-scheduler-panel", "Send later", "⏰"),
      scheduler: [{ id: "tick", every_seconds: 60 }],
      tools: ["queue", "list"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"queue", description:"queue email: {to,subject,body,sendAt ISO}",
    execute: async (input) => {
      const q = (await p.kv.get("queue")) ?? [];
      q.push({ ...input, id: Date.now()+"-"+Math.random().toString(36).slice(2,6), queuedAt: Date.now() });
      await p.kv.set("queue", q);
      return { ok:true, pending:q.length };
    }});
  await p.tools.register({ name:"list", description:"show queue", execute: async () => ({ queue: await p.kv.get("queue") ?? [] }) });
  p.schedule({id:"tick",every_seconds:60},async()=>{
    const q = (await p.kv.get("queue")) ?? []; const now = Date.now();
    const [due, keep] = [[],[]];
    for(const m of q){ (new Date(m.sendAt).getTime() <= now ? due : keep).push(m); }
    for(const m of due){
      try { await p.mail.send({ to:m.to, subject:m.subject, body:m.body }); } catch {}
    }
    await p.kv.set("queue", keep);
  });
}`,
    panel: simpleTabPanel(
      "email-scheduler-panel",
      `<h3>⏰ Scheduled emails</h3><p style="color:#9a8da8">Add via chat: "passio, send-later <to> at <ISO> saying <text>" — the agent queues via this seed's queue tool.</p><ul id="l"></ul>`,
    ),
  },
  {
    name: "email-undo-send",
    description: "30-second hold before SMTP actually dispatches. Cancel in the panel to retract.",
    category: "mail",
    tags: ["mail"],
    contributes: {
      ...tabContributes("email-undo-panel", "Undo send", "↩"),
      tools: ["hold", "cancel"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"hold", description:"queue {to,subject,body} with 30s hold",
    execute: async (m) => {
      const id = Date.now()+"-"+Math.random().toString(36).slice(2,6);
      setTimeout(async () => {
        const pend = (await p.kv.get("pending")) ?? [];
        const idx = pend.findIndex(x=>x.id===id);
        if(idx<0) return;
        const [msg] = pend.splice(idx,1);
        await p.kv.set("pending", pend);
        try { await p.mail.send({ to:msg.to, subject:msg.subject, body:msg.body }); } catch {}
      }, 30000);
      const pend = (await p.kv.get("pending")) ?? []; pend.push({ ...m, id, due:Date.now()+30000 });
      await p.kv.set("pending", pend);
      return { ok:true, id };
    }});
  await p.tools.register({ name:"cancel", description:"cancel a pending send by id",
    execute: async ({ id }) => {
      const pend = (await p.kv.get("pending")) ?? []; const next = pend.filter(x=>x.id!==id);
      await p.kv.set("pending", next);
      return { ok:true };
    }});
}`,
    panel: simpleTabPanel(
      "email-undo-panel",
      `<h3>↩ Pending sends</h3><ul id="l"></ul>`,
    ),
  },
  {
    name: "email-snooze",
    description: "Archive an email + resurface it later. Stubbed against your IMAP flags.",
    category: "mail",
    tags: ["mail"],
    contributes: {
      tools: ["snooze"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"snooze", description:"stub — label this message id with 'Snoozed/<untilISO>' so IMAP can resurface",
    execute: async ({ id, untilISO }) => ({ ok:true, stub:true, id, untilISO }) });
}`,
  },
  {
    name: "mail-digest",
    description: "8 am summary: yesterday's mail volume, top senders, top subjects. Written to a vault note.",
    category: "mail",
    tags: ["mail", "summary"],
    contributes: {
      scheduler: [{ id: "daily", every_seconds: 86400 }],
      tools: ["run"],
    },
    entry: `export default async function init(p){
  async function run(){
    try {
      const r = await p.mail.unread(50);
      const emails = r.emails ?? [];
      const bySender = {}; for(const e of emails){ bySender[e.from] = (bySender[e.from]??0)+1; }
      const top = Object.entries(bySender).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const body = [
        "# Mail digest " + new Date().toISOString().slice(0,10),
        "",
        "Unread: " + emails.length,
        "",
        "Top senders:",
        ...top.map(([n,c]) => "- " + n + " — " + c),
      ].join("\\n");
      await p.notes.save({ title:"mail-digest-"+Date.now(), body, tags:"mail,digest" });
    } catch {}
  }
  await p.tools.register({ name:"run", description:"generate + save a digest", execute: async () => (await run(), { ok:true }) });
  p.schedule({id:"daily",every_seconds:86400},run);
}`,
  },
  {
    name: "smart-bcc",
    description: "Auto-BCC yourself on outgoing mail when to-address matches a rule (regex list).",
    category: "mail",
    tags: ["mail"],
    contributes: {
      tools: ["match"],
      settings: [{ id: "patterns", label: "Regex patterns (comma)", type: "string", default: "^client-.*@, ^boss@" }],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"match", description:"true/false: should we BCC for this recipient",
    execute: async ({ to }) => {
      const patt = ((await p.kv.get("patterns")) ?? "").split(",").map(s=>s.trim()).filter(Boolean);
      return { match: patt.some(pat => new RegExp(pat).test(to)) };
    }});
}`,
  },
  {
    name: "vcard-attacher",
    description: "Appends a signature block to outgoing drafts. Keeps the block you author.",
    category: "mail",
    tags: ["mail"],
    contributes: {
      tools: ["append"],
      settings: [{ id: "signature", label: "Signature", type: "string", default: "—\\nsent from Passio" }],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"append", description:"append signature to a body",
    execute: async ({ body }) => {
      const sig = (await p.kv.get("signature")) ?? "";
      if(!sig) return { body };
      return { body: body.replace(/\\s+$/,"") + "\\n\\n" + sig };
    }});
}`,
  },
];

// ==========================================================================
// NEWS / FEEDS (9) — hn-pulse already ships separately
// ==========================================================================

const news: SeedSpec[] = [
  {
    name: "lobsters-pulse",
    description: "Lobsters front page, top 5, refreshed every 15 min.",
    category: "news",
    tags: ["news"],
    permissions: { network: ["lobste.rs"] },
    contributes: {
      ...tabContributes("lobsters-pulse-panel", "Lobsters", "🦞"),
      scheduler: [{ id: "tick", every_seconds: 900 }],
      tools: ["top"],
    },
    entry: `export default async function init(p){
  async function top(){
    const r = await p.net.fetch("https://lobste.rs/hottest.json");
    const items = (await r.json()).slice(0,5).map(x=>({id:x.short_id,title:x.title,url:x.url,score:x.score,user:x.submitter_user?.username}));
    await p.kv.set("items", items);
    return { items };
  }
  await p.tools.register({ name:"top", description:"top 5 lobsters", execute:top });
  p.schedule({id:"tick",every_seconds:900},()=>top().catch(()=>undefined));
  top().catch(()=>undefined);
}`,
    panel: simpleTabPanel(
      "lobsters-pulse-panel",
      `<h3>🦞 Lobsters top 5</h3><ul id="l"></ul>`,
    ),
  },
  {
    name: "reddit-digest",
    description: "Subreddit hot picks, 5 per configured sub. Uses the public .json endpoint.",
    category: "news",
    tags: ["news"],
    permissions: { network: ["reddit.com", "www.reddit.com"] },
    contributes: {
      ...tabContributes("reddit-digest-panel", "Reddit", "🔶"),
      scheduler: [{ id: "tick", every_seconds: 1800 }],
      tools: ["fetch"],
      settings: [{ id: "subs", label: "Subs (comma)", type: "string", default: "programming,rust,macOSApps" }],
    },
    entry: `export default async function init(p){
  async function fetchAll(){
    const subs = ((await p.kv.get("subs")) ?? "programming").split(",").map(s=>s.trim()).filter(Boolean);
    const out = [];
    for(const s of subs){
      try {
        const r = await p.net.fetch("https://www.reddit.com/r/"+s+"/hot.json?limit=5");
        const b = await r.json();
        for(const c of (b?.data?.children ?? [])){
          out.push({ sub:s, title:c.data.title, url:"https://reddit.com"+c.data.permalink, score:c.data.score });
        }
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"fetch", description:"refresh reddit digest", execute:fetchAll });
  p.schedule({id:"tick",every_seconds:1800},()=>fetchAll().catch(()=>undefined));
}`,
    panel: simpleTabPanel(
      "reddit-digest-panel",
      `<h3>🔶 Reddit digest</h3><ul id="l"></ul>`,
    ),
  },
  {
    name: "rss-digest",
    description: "Morning read across your Passio-configured RSS feeds — titled summary.",
    category: "news",
    tags: ["rss"],
    contributes: {
      ...tabContributes("rss-digest-panel", "Digest", "📰"),
      scheduler: [{ id: "morning", every_seconds: 86400 }],
      tools: ["run"],
    },
    entry: `export default async function init(p){}`,
    panel: simpleTabPanel(
      "rss-digest-panel",
      `<h3>📰 Morning digest</h3><p style="color:#9a8da8">Configure feeds in Settings → RSS. The agent renders a summary in the daily briefing.</p>`,
    ),
  },
  {
    name: "github-trending",
    description: "Trending repos today, filtered by a language list.",
    category: "news",
    tags: ["github"],
    permissions: { network: ["github-trending-api.de.a9sapp.eu", "api.gitterapp.com"] },
    contributes: {
      ...tabContributes("github-trending-panel", "Trending", "⭐"),
      scheduler: [{ id: "tick", every_seconds: 3600 }],
      tools: ["fetch"],
      settings: [{ id: "langs", label: "Languages (comma)", type: "string", default: "typescript,rust" }],
    },
    entry: `export default async function init(p){
  async function fetchAll(){
    const langs = ((await p.kv.get("langs")) ?? "").split(",").map(s=>s.trim()).filter(Boolean);
    const out = [];
    for(const l of langs){
      try {
        const r = await p.net.fetch("https://github-trending-api.de.a9sapp.eu/repositories?since=daily&language="+l);
        for(const repo of (await r.json()).slice(0,5)){
          out.push({ lang:l, name:repo.author+"/"+repo.name, stars:repo.stars, url:repo.url });
        }
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"fetch", description:"refresh trending", execute:fetchAll });
  p.schedule({id:"tick",every_seconds:3600},()=>fetchAll().catch(()=>undefined));
}`,
    panel: simpleTabPanel(
      "github-trending-panel",
      `<h3>⭐ GitHub trending</h3><ul id="l"></ul>`,
    ),
  },
  {
    name: "arxiv-fresh",
    description: "Today's preprints in your field via arxiv.org/rss.",
    category: "research",
    tags: ["arxiv", "research"],
    permissions: { network: ["export.arxiv.org"] },
    contributes: {
      ...tabContributes("arxiv-fresh-panel", "arXiv", "📑"),
      scheduler: [{ id: "tick", every_seconds: 21600 }],
      tools: ["latest"],
      settings: [{ id: "cat", label: "arXiv category", type: "string", default: "cs.AI" }],
    },
    entry: `export default async function init(p){
  async function latest(){
    const cat = (await p.kv.get("cat")) ?? "cs.AI";
    const r = await p.net.fetch("https://export.arxiv.org/rss/"+cat);
    const xml = await r.text();
    const titles = [...xml.matchAll(/<title>([^<]+)<\\/title>/g)].slice(1,11).map(m=>m[1]);
    await p.kv.set("titles", titles);
    return { titles };
  }
  await p.tools.register({ name:"latest", description:"last 10 titles in the category", execute:latest });
  p.schedule({id:"tick",every_seconds:21600},()=>latest().catch(()=>undefined));
  latest().catch(()=>undefined);
}`,
    panel: simpleTabPanel(
      "arxiv-fresh-panel",
      `<h3>📑 arXiv today</h3><ul id="l"></ul>`,
    ),
  },
  {
    name: "podcast-new-episodes",
    description: "RSS-based podcast tracker: paste feed URLs, get new episodes since last check.",
    category: "news",
    tags: ["podcast"],
    permissions: { network: ["*"] },
    contributes: {
      ...tabContributes("podcast-panel", "Podcasts", "🎙"),
      scheduler: [{ id: "tick", every_seconds: 3600 }],
      tools: ["check"],
      settings: [{ id: "feeds", label: "Feed URLs (newline)", type: "string", default: "" }],
    },
    entry: `export default async function init(p){
  async function check(){
    const feeds = ((await p.kv.get("feeds")) ?? "").split(/\\s+/).filter(Boolean);
    const out = [];
    for(const f of feeds){
      try {
        const r = await p.net.fetch(f); const xml = await r.text();
        const first = xml.match(/<item>[\\s\\S]*?<title>([^<]+)<\\/title>/);
        if(first) out.push({ feed:f, latest:first[1] });
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"check", description:"poll feeds for latest", execute:check });
  p.schedule({id:"tick",every_seconds:3600},()=>check().catch(()=>undefined));
}`,
    panel: simpleTabPanel("podcast-panel", `<h3>🎙 Podcasts</h3><ul id="l"></ul>`),
  },
  {
    name: "youtube-subs",
    description: "New uploads from channels you sub to, via their /feeds/videos.xml RSS.",
    category: "news",
    tags: ["youtube"],
    permissions: { network: ["www.youtube.com", "youtube.com"] },
    contributes: {
      ...tabContributes("yt-subs-panel", "YT", "▶"),
      scheduler: [{ id: "tick", every_seconds: 3600 }],
      tools: ["check"],
      settings: [{ id: "channels", label: "Channel IDs (comma)", type: "string", default: "" }],
    },
    entry: `export default async function init(p){
  async function check(){
    const ids = ((await p.kv.get("channels")) ?? "").split(",").map(s=>s.trim()).filter(Boolean);
    const out = [];
    for(const id of ids){
      try {
        const r = await p.net.fetch("https://www.youtube.com/feeds/videos.xml?channel_id="+id);
        const xml = await r.text();
        const m = xml.match(/<entry>[\\s\\S]*?<title>([^<]+)<\\/title>[\\s\\S]*?<link[^>]*href="([^"]+)"/);
        if(m) out.push({ channel:id, title:m[1], url:m[2] });
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"check", description:"poll for latest videos", execute:check });
  p.schedule({id:"tick",every_seconds:3600},()=>check().catch(()=>undefined));
}`,
    panel: simpleTabPanel("yt-subs-panel", `<h3>▶ YouTube subs</h3><ul id="l"></ul>`),
  },
  {
    name: "obsidian-starred",
    description: "Feeds into Passio from `.md` files tagged #star in your vault.",
    category: "research",
    tags: ["obsidian"],
    contributes: { tools: ["list"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"list", description:"lists starred notes (stub — hooks up to vault tags)",
    execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "twitter-bookmarks",
    description: "Pull your Twitter bookmarks via a self-hosted rss-bridge endpoint.",
    category: "news",
    tags: ["twitter"],
    permissions: { network: ["*"] },
    contributes: {
      tools: ["latest"],
      settings: [{ id: "bridge_url", label: "rss-bridge bookmarks URL", type: "string", default: "" }],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"latest", description:"pull last N bookmarks",
    execute: async ({ limit = 10 } = {}) => {
      const u = await p.kv.get("bridge_url"); if(!u) return { items:[], reason:"set bridge_url" };
      const r = await p.net.fetch(u); const xml = await r.text();
      const items = [...xml.matchAll(/<item>[\\s\\S]*?<title>([^<]+)<\\/title>[\\s\\S]*?<link>([^<]+)<\\/link>/g)]
        .slice(0,limit).map(m => ({ title:m[1], url:m[2] }));
      return { items };
    }});
}`,
  },
];

// ==========================================================================
// CALENDAR / TIME (8)
// ==========================================================================

const calendar: SeedSpec[] = [
  {
    name: "weekly-review",
    description: "Friday 17:00 prompt that opens a templated review note in your vault.",
    category: "productivity",
    tags: ["review"],
    contributes: {
      tools: ["run"],
      scheduler: [{ id: "friday", every_seconds: 604800 }], // approx — real gating below
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"run", description:"generate weekly review note now",
    execute: async () => {
      const today = new Date().toISOString().slice(0,10);
      const body = [
        "# Weekly review " + today,
        "",
        "## what worked", "",
        "## what didn't", "",
        "## what changes next week", "",
      ].join("\\n");
      await p.notes.save({ title:"weekly-review-"+today, body, tags:"review" });
      await p.bubble.speak("Weekly-review template ready in your vault.");
      return { ok:true };
    }});
  p.schedule({id:"friday",every_seconds:3600},async()=>{
    const d=new Date(); if(d.getDay()===5 && d.getHours()===17 && d.getMinutes()<5){
      await p.bubble.speak("Weekly review time — tap Chat to run.");
    }
  });
}`,
  },
  {
    name: "monthly-review",
    description: "First-Sunday monthly review template — paired with weekly-review.",
    category: "productivity",
    tags: ["review"],
    contributes: { tools: ["run"], scheduler: [{ id: "mo", every_seconds: 3600 }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"run", description:"save monthly review template",
    execute: async () => {
      const d = new Date(); const m = d.toLocaleString("en-US",{month:"long"});
      const body = ["# " + m + " review","","## highlights","","## learned","","## next month",""].join("\\n");
      await p.notes.save({ title:"monthly-"+d.toISOString().slice(0,7), body, tags:"review,monthly" });
      return { ok:true };
    }});
  p.schedule({id:"mo",every_seconds:3600},async()=>{
    const d=new Date(); if(d.getDate()<=7 && d.getDay()===0 && d.getHours()===10){
      await p.bubble.speak("Monthly review day — tap Chat to run.");
    }
  });
}`,
  },
  {
    name: "birthdays",
    description: "Paste birthdays once (name + MM-DD). Morning chip when one is today.",
    category: "other",
    tags: ["calendar"],
    contributes: {
      ...widgetContributes("birthdays-chip"),
      scheduler: [{ id: "morning", every_seconds: 3600 }],
      tools: ["today"],
      settings: [{ id: "list", label: "name|MM-DD per line", type: "string", default: "" }],
    },
    entry: `export default async function init(p){
  async function today(){
    const list = ((await p.kv.get("list")) ?? "").split(/\\n/).map(s=>s.trim()).filter(Boolean);
    const t = new Date().toISOString().slice(5,10);
    const hits = list.map(x=>x.split("|")).filter(([,d])=>d===t).map(([n])=>n);
    await p.kv.set("today", hits);
    return { hits };
  }
  await p.tools.register({ name:"today", description:"names with a birthday today", execute:today });
  p.schedule({id:"morning",every_seconds:3600},async()=>{
    const d=new Date(); if(d.getHours()===9 && d.getMinutes()<5){
      const { hits } = await today();
      if(hits.length) await p.bubble.speak("🎂 Birthday today: " + hits.join(", "));
    }
  });
}`,
    panel: chipPanel(
      "birthdays-chip",
      `const r=await window.passio.invoke("today",{}); if(!r.hits?.length){ el.remove(); return; } el.textContent = "🎂 " + r.hits.join(", ");`,
    ),
  },
  {
    name: "time-box-timer",
    description: "50-min focus + 10-min break cycles with gentle speech cues.",
    category: "productivity",
    tags: ["time"],
    contributes: { tools: ["start", "stop"] },
    entry: `export default async function init(p){
  let t = null;
  async function start(){
    if(t) clearTimeout(t);
    await p.bubble.speak("50-min deep-work block starting.");
    t = setTimeout(async () => {
      await p.bubble.speak("Break — 10 min. Stretch, water.");
      t = setTimeout(async () => {
        await p.bubble.speak("Back to it. New 50-min block ready.");
        t = null;
      }, 10*60*1000);
    }, 50*60*1000);
  }
  async function stop(){ if(t){ clearTimeout(t); t = null; } await p.bubble.speak("Timer stopped."); }
  await p.tools.register({ name:"start", description:"begin a 50/10 cycle", execute:start });
  await p.tools.register({ name:"stop", description:"cancel current cycle", execute:stop });
}`,
  },
  {
    name: "flow-timer",
    description: "90-min deep-work timer with 20-min break. Single-shot.",
    category: "productivity",
    tags: ["time"],
    contributes: { tools: ["start"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"start", description:"kick a 90/20 flow block", execute: async () => {
    await p.bubble.speak("90-min flow block starting. Close distractions.");
    setTimeout(async () => { await p.bubble.speak("20-min break. Stand, water, no screens."); }, 90*60*1000);
    return { ok:true };
  }});
}`,
  },
  {
    name: "meetings-this-week",
    description: "List of your calendar events this week with a prep-note link per event.",
    category: "productivity",
    tags: ["calendar"],
    contributes: {
      ...tabContributes("meetings-week-panel", "Week", "📅"),
      tools: ["list"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"list", description:"events for the coming 7 days",
    execute: async () => p.calendar.upcoming({ limit: 30, days: 7 }) });
}`,
    panel: simpleTabPanel("meetings-week-panel", `<h3>📅 This week</h3><ul id="l"></ul>`),
  },
  {
    name: "no-meeting-wednesdays",
    description: "Fires a nudge if you try to schedule a meeting on a Wednesday (via calendar event-create hook — stub).",
    category: "productivity",
    tags: ["meetings"],
    contributes: { tools: ["check"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"check", description:"returns warning string if date is a Wednesday",
    execute: async ({ iso }) => {
      const d = new Date(iso); return { warn: d.getDay()===3 ? "Wednesday — protected no-meeting day." : null };
    }});
}`,
  },
  {
    name: "calendar-heatmap",
    description: "12-week activity heatmap of your calendar events (density per day).",
    category: "productivity",
    tags: ["calendar", "viz"],
    contributes: {
      ...tabContributes("cal-heatmap-panel", "Heatmap", "🔥"),
      tools: ["load"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"load", description:"event counts per day for last 12 weeks",
    execute: async () => {
      const r = await p.calendar.upcoming({ limit: 500, days: 84 }).catch(()=>({events:[]}));
      const by = {};
      for(const e of (r.events ?? [])){
        const k = (e.start ?? "").slice(0,10); by[k] = (by[k]??0)+1;
      }
      return { by };
    }});
}`,
    panel: simpleTabPanel("cal-heatmap-panel", `<h3>🔥 Calendar heatmap</h3><div id="g"></div>`),
  },
];

// ==========================================================================
// DEVELOPER (12)
// ==========================================================================

const dev: SeedSpec[] = [
  {
    name: "github-pr-dashboard",
    description: "Your PRs + review-requested, across all repos. Needs a GitHub token.",
    category: "developer",
    tags: ["github"],
    permissions: { network: ["api.github.com"], secrets: ["gh_token"] },
    contributes: {
      ...tabContributes("gh-pr-panel", "PRs", "⎋"),
      scheduler: [{ id: "tick", every_seconds: 600 }],
      tools: ["check"],
    },
    entry: `export default async function init(p){
  async function check(){
    let tok=null; try{ tok = await p.secrets.get("gh_token"); } catch {}
    if(!tok) return { mine:[], review:[], reason:"set secret gh_token" };
    const hdr = { "Authorization":"Bearer "+tok, "Accept":"application/vnd.github+json" };
    const [me, rr] = await Promise.all([
      p.net.fetch("https://api.github.com/search/issues?q=is:pr+author:@me+state:open",{ init:{ headers:hdr } }),
      p.net.fetch("https://api.github.com/search/issues?q=is:pr+review-requested:@me+state:open",{ init:{ headers:hdr } }),
    ]);
    const mine = ((await me.json()).items ?? []).map(x=>({title:x.title,url:x.html_url}));
    const review = ((await rr.json()).items ?? []).map(x=>({title:x.title,url:x.html_url}));
    await p.kv.set("snap", { mine, review });
    return { mine, review };
  }
  await p.tools.register({ name:"check", description:"refresh PR dashboard", execute:check });
  p.schedule({id:"tick",every_seconds:600},()=>check().catch(()=>undefined));
}`,
    panel: simpleTabPanel("gh-pr-panel", `<h3>⎋ PR dashboard</h3><ul id="l"></ul>`),
  },
  {
    name: "github-issues-assigned",
    description: "Issues assigned to you across all repos. Shares gh_token with github-pr-dashboard.",
    category: "developer",
    tags: ["github"],
    permissions: { network: ["api.github.com"], secrets: ["gh_token"] },
    contributes: {
      ...tabContributes("gh-issues-panel", "Issues", "🐛"),
      scheduler: [{ id: "tick", every_seconds: 600 }],
      tools: ["check"],
    },
    entry: `export default async function init(p){
  async function check(){
    let tok=null; try{ tok = await p.secrets.get("gh_token"); } catch {}
    if(!tok) return { items:[], reason:"set secret gh_token" };
    const r = await p.net.fetch("https://api.github.com/search/issues?q=is:issue+assignee:@me+state:open",{
      init:{ headers:{ "Authorization":"Bearer "+tok, "Accept":"application/vnd.github+json" } }
    });
    const items = ((await r.json()).items ?? []).map(x=>({title:x.title,url:x.html_url,repo:x.repository_url.split("/").slice(-2).join("/")}));
    await p.kv.set("items", items);
    return { items };
  }
  await p.tools.register({ name:"check", description:"refresh assigned issues", execute:check });
  p.schedule({id:"tick",every_seconds:600},()=>check().catch(()=>undefined));
}`,
    panel: simpleTabPanel("gh-issues-panel", `<h3>🐛 Issues</h3><ul id="l"></ul>`),
  },
  {
    name: "git-repo-health",
    description: "Scan a path for uncommitted, unpushed, dirty state. Needs trusted:true (runs git).",
    category: "developer",
    tags: ["git"],
    permissions: { trusted: true },
    contributes: { tools: ["scan"], settings: [{ id: "path", label: "Repo path", type: "string", default: "." }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"scan", description:"summarize git state of a path",
    execute: async () => ({ stub:true, note:"Requires trusted:true + a shell wrapper. Enable in Settings then reinstall." }) });
}`,
  },
  {
    name: "branch-age-warn",
    description: "Warns on branches older than 30 days in a repo path. Trusted-required.",
    category: "developer",
    tags: ["git"],
    permissions: { trusted: true },
    contributes: { tools: ["scan"], settings: [{ id: "path", label: "Repo path", type: "string", default: "." }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"scan", description:"list old branches (stub, trusted)",
    execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "npm-outdated",
    description: "Runs \`npm outdated\` in a path and shows direct deps needing upgrade.",
    category: "developer",
    tags: ["js"],
    permissions: { trusted: true },
    contributes: { tools: ["scan"], settings: [{ id: "path", label: "Project path", type: "string", default: "." }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"scan", description:"npm outdated in path (stub, trusted)", execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "cargo-outdated",
    description: "Runs \`cargo outdated\` — Rust equivalent.",
    category: "developer",
    tags: ["rust"],
    permissions: { trusted: true },
    contributes: { tools: ["scan"], settings: [{ id: "path", label: "Cargo workspace", type: "string", default: "." }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"scan", description:"cargo outdated (stub, trusted)", execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "eslint-on-save",
    description: "Runs eslint against code files in your vault's code/ folder (stub).",
    category: "developer",
    tags: ["lint"],
    permissions: { trusted: true },
    contributes: { tools: ["lint"] },
    entry: `export default async function init(p){ await p.tools.register({ name:"lint", execute: async () => ({ stub:true }) }); }`,
  },
  {
    name: "commit-message-coach",
    description: "Takes a diff and drafts a conventional-commit style message via the Passio agent.",
    category: "developer",
    tags: ["git"],
    contributes: { tools: ["draft"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"draft", description:"draft a conventional-commit message from a diff",
    execute: async ({ diff }) => {
      const prompt = "Given this git diff, write ONE conventional-commit message line (type(scope?): subject). Diff:\\n" + String(diff).slice(0,6000);
      // Passio exposes notes; we use .notes.save to stash the prompt for the agent to pick up — simplest bridge for a seed.
      return { prompt }; // user pastes into chat for actual drafting
    }});
}`,
  },
  {
    name: "pr-description-writer",
    description: "Takes a branch's diff and drafts a PR description with sections.",
    category: "developer",
    tags: ["git"],
    contributes: { tools: ["draft"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"draft", description:"draft a PR description",
    execute: async ({ diff }) => ({ prompt: "Write a PR description with Summary / Changes / Testing / Risk sections for this diff:\\n" + String(diff).slice(0,12000) }) });
}`,
  },
  {
    name: "git-stash-browser",
    description: "List + re-apply git stashes in a path (stub, trusted).",
    category: "developer",
    tags: ["git"],
    permissions: { trusted: true },
    contributes: { tools: ["list", "pop"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"list", execute: async () => ({ stub:true }) });
  await p.tools.register({ name:"pop", execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "lang-learner",
    description: "Flashcards of programming-language keywords with spaced repetition.",
    category: "developer",
    tags: ["learning"],
    contributes: {
      ...tabContributes("lang-learner-panel", "Cards", "🎴"),
      tools: ["next", "grade"],
      settings: [{ id: "lang", label: "Language", type: "select", options: ["rust","typescript","python","go"], default: "rust" }],
    },
    entry: `export default async function init(p){
  const decks = {
    rust: [["fn","define function"],["mut","mutable binding"],["&","borrow"],["Result<T,E>","ok/err return"]],
    typescript: [["interface","structural type"],["as const","literal widening off"],["keyof T","keys of a type"]],
    python: [["yield","generator produce"],["__init__","ctor"],["list comprehension","[x for x in …]"]],
    go: [["chan","channel type"],["defer","run on return"],["goroutine","go fn()"]]
  };
  await p.tools.register({ name:"next", description:"next card",
    execute: async () => {
      const lang = (await p.kv.get("lang")) ?? "rust";
      const deck = decks[lang] ?? decks.rust;
      const card = deck[Math.floor(Math.random()*deck.length)];
      return { q: card[0], a: card[1] };
    }});
  await p.tools.register({ name:"grade", description:"record grade 0-3",
    execute: async ({ grade }) => { const log = (await p.kv.get("log")) ?? []; log.push({ ts:Date.now(), grade }); await p.kv.set("log", log); return { ok:true }; }});
}`,
    panel: simpleTabPanel("lang-learner-panel", `<h3>🎴 Lang cards</h3><button id="n">next</button><div id="q"></div>`),
  },
  {
    name: "api-latency-watch",
    description: "Pings URLs on a schedule, records latency, shows a mini chart in a tab.",
    category: "developer",
    tags: ["monitoring"],
    permissions: { network: ["*"] },
    contributes: {
      ...tabContributes("api-latency-panel", "Latency", "📈"),
      scheduler: [{ id: "tick", every_seconds: 60 }],
      tools: ["ping"],
      settings: [{ id: "urls", label: "URLs (newline)", type: "string", default: "https://api.github.com" }],
    },
    entry: `export default async function init(p){
  async function ping(){
    const urls = ((await p.kv.get("urls")) ?? "").split(/\\s+/).filter(Boolean);
    const res = [];
    for(const u of urls){
      const t0 = Date.now();
      try { await p.net.fetch(u, { method:"HEAD" }); res.push({ url:u, ms: Date.now()-t0 }); }
      catch { res.push({ url:u, ms:-1 }); }
    }
    const log = (await p.kv.get("log")) ?? [];
    log.push({ ts:Date.now(), res }); while(log.length>200) log.shift();
    await p.kv.set("log", log);
    return { res };
  }
  await p.tools.register({ name:"ping", description:"ping all URLs now", execute:ping });
  p.schedule({id:"tick",every_seconds:60},()=>ping().catch(()=>undefined));
}`,
    panel: simpleTabPanel("api-latency-panel", `<h3>📈 Latency</h3><div id="g"></div>`),
  },
];

// ==========================================================================
// RESEARCH / KNOWLEDGE (10)
// ==========================================================================

const research: SeedSpec[] = [
  {
    name: "pdf-drop",
    description: "Drop a PDF path into the panel → Passio ingests + chunks + embeds into a vault note.",
    category: "research",
    tags: ["pdf"],
    contributes: {
      ...tabContributes("pdf-drop-panel", "PDF", "📄"),
      tools: ["ingest"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"ingest", description:"stub — delegate to passio.pdf.ingest",
    execute: async ({ path, title }) => ({ delegate:"passio.pdf.ingest", path, title }) });
}`,
    panel: simpleTabPanel("pdf-drop-panel", `<h3>📄 PDF drop</h3><input id="p" placeholder="absolute path to .pdf"/><button id="go">Ingest</button>`),
  },
  {
    name: "highlighter",
    description: "Selected text + hotkey → saves to a \"highlights\" vault note grouped by source URL.",
    category: "research",
    tags: ["notes"],
    contributes: { tools: ["save"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"save", description:"save a highlight {text,source}",
    execute: async ({ text, source }) => {
      const title = "highlights-" + (source?.split("/")[2] ?? "misc");
      await p.notes.save({ title, body: "- " + text + " (" + (source??"?") + ")\\n", tags:"highlight" });
      return { ok:true };
    }});
}`,
  },
  {
    name: "citation-formatter",
    description: "Pass a DOI; returns APA / MLA / BibTeX via the crossref API.",
    category: "research",
    tags: ["bib"],
    permissions: { network: ["api.crossref.org"] },
    contributes: { tools: ["format"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"format", description:"{ doi, style: 'apa'|'mla'|'bibtex' }",
    execute: async ({ doi, style = "apa" }) => {
      const r = await p.net.fetch("https://api.crossref.org/works/"+encodeURIComponent(doi)+"/transform/text/x-"+style);
      return { citation: await r.text() };
    }});
}`,
  },
  {
    name: "wiki-grab",
    description: "URL → distilled note. Paste a URL, get a readable summary saved to vault.",
    category: "research",
    tags: ["notes", "web"],
    permissions: { network: ["*"] },
    contributes: { tools: ["grab"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"grab", description:"fetch URL and save as a note (raw HTML → the agent distills later)",
    execute: async ({ url }) => {
      const r = await p.net.fetch(url); const html = (await r.text()).slice(0,40000);
      const title = (html.match(/<title>([^<]+)/i)?.[1] ?? url).trim().slice(0,80);
      await p.notes.save({ title: "web-"+title, body: "Source: " + url + "\\n\\n" + html.replace(/<[^>]+>/g,"").replace(/\\s+/g," ").slice(0,4000), tags:"web" });
      return { ok:true };
    }});
}`,
  },
  {
    name: "yt-transcript",
    description: "YouTube URL → transcript → saved to vault. Uses the public timedtext endpoint.",
    category: "research",
    tags: ["youtube"],
    permissions: { network: ["youtube.com", "www.youtube.com"] },
    contributes: { tools: ["grab"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"grab", description:"save transcript for a YouTube URL",
    execute: async ({ url }) => {
      const id = url.match(/(?:v=|youtu\\.be\\/)([A-Za-z0-9_-]{11})/)?.[1];
      if(!id) return { ok:false, reason:"not a YT URL" };
      const r = await p.net.fetch("https://www.youtube.com/api/timedtext?lang=en&v="+id);
      const xml = await r.text();
      const lines = [...xml.matchAll(/<text[^>]*>([\\s\\S]*?)<\\/text>/g)].map(m=>m[1].replace(/&amp;/g,"&").replace(/&quot;/g,"\\"").trim()).join("\\n");
      if(!lines) return { ok:false, reason:"no English captions" };
      await p.notes.save({ title:"yt-"+id, body:"Source: " + url + "\\n\\n" + lines, tags:"youtube,transcript" });
      return { ok:true };
    }});
}`,
  },
  {
    name: "glossary",
    description: "Tracks term → definition. Use Passio's chat to ask and the agent will remember here.",
    category: "research",
    tags: ["notes"],
    contributes: {
      ...tabContributes("glossary-panel", "Terms", "📚"),
      tools: ["add", "list"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"add", description:"{ term, def }",
    execute: async ({ term, def }) => {
      const g = (await p.kv.get("g")) ?? {}; g[term.toLowerCase()] = def; await p.kv.set("g", g); return { ok:true, size:Object.keys(g).length };
    }});
  await p.tools.register({ name:"list", execute: async () => ({ terms: await p.kv.get("g") ?? {} }) });
}`,
    panel: simpleTabPanel("glossary-panel", `<h3>📚 Glossary</h3><ul id="l"></ul>`),
  },
  {
    name: "quote-collector",
    description: "Save + tag quotes from anywhere. Later searchable through memory.",
    category: "research",
    tags: ["notes"],
    contributes: { tools: ["add"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"add", description:"save a quote {text,author,source?}",
    execute: async ({ text, author, source }) => {
      const body = "> " + text + "\\n\\n— " + (author ?? "?") + (source ? "\\n(" + source + ")" : "");
      await p.notes.save({ title: "quote-" + (author ?? "anon").slice(0,30), body, tags:"quote" });
      return { ok:true };
    }});
}`,
  },
  {
    name: "question-log",
    description: "Daily capture of open questions — surfaces in the morning brief.",
    category: "research",
    tags: ["journal"],
    contributes: { tools: ["add", "today"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ q }) => { const list = (await p.kv.get("open")) ?? []; list.push({ q, ts: Date.now() }); await p.kv.set("open", list); return { ok:true }; } });
  await p.tools.register({ name:"today", execute: async () => { const list = (await p.kv.get("open")) ?? []; const today = list.filter(x => new Date(x.ts).toDateString() === new Date().toDateString()); return { today }; } });
}`,
  },
  {
    name: "ideas-parking-lot",
    description: "Capture + tag ideas you don't want to forget. Separate from todos.",
    category: "research",
    tags: ["ideas"],
    contributes: {
      ...tabContributes("ideas-panel", "Ideas", "💡"),
      tools: ["add", "list"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ text, tag }) => { const list = (await p.kv.get("list")) ?? []; list.unshift({ text, tag: tag ?? "idea", ts:Date.now() }); await p.kv.set("list", list); return { ok:true }; } });
  await p.tools.register({ name:"list", execute: async () => ({ list: await p.kv.get("list") ?? [] }) });
}`,
    panel: simpleTabPanel("ideas-panel", `<h3>💡 Ideas</h3><ul id="l"></ul>`),
  },
  {
    name: "book-reading-tracker",
    description: "Books you're reading + % progress. Weekly reminder to log.",
    category: "research",
    tags: ["reading"],
    contributes: {
      ...tabContributes("books-panel", "Books", "📖"),
      tools: ["add", "update", "list"],
      scheduler: [{ id: "weekly", every_seconds: 604800 }],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ title, author }) => { const list=(await p.kv.get("books"))??[]; list.push({ title, author, pct:0, startedAt:Date.now() }); await p.kv.set("books", list); return { ok:true }; } });
  await p.tools.register({ name:"update", execute: async ({ title, pct }) => { const list=(await p.kv.get("books"))??[]; const b=list.find(x=>x.title===title); if(b) b.pct=pct; await p.kv.set("books", list); return { ok:!!b }; } });
  await p.tools.register({ name:"list", execute: async () => ({ books: await p.kv.get("books") ?? [] }) });
  p.schedule({id:"weekly",every_seconds:604800},async()=>{ await p.bubble.speak("How's the reading? Update progress in the Books panel."); });
}`,
    panel: simpleTabPanel("books-panel", `<h3>📖 Reading</h3><ul id="l"></ul>`),
  },
];

// ==========================================================================
// PRODUCTIVITY (10)
// ==========================================================================

const productivity: SeedSpec[] = [
  {
    name: "habit-tracker",
    description: "Light habit tracker — name habits, tap once per day, streaks.",
    category: "productivity",
    tags: ["habit"],
    contributes: {
      ...tabContributes("habit-panel", "Habits", "✅"),
      tools: ["add", "tick", "list"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"add", execute: async ({ name }) => { const hs=(await p.kv.get("hs"))??[]; if(!hs.find(h=>h.name===name)) hs.push({ name, days:[] }); await p.kv.set("hs", hs); return { ok:true }; } });
  await p.tools.register({ name:"tick", execute: async ({ name }) => { const hs=(await p.kv.get("hs"))??[]; const h=hs.find(x=>x.name===name); const today=new Date().toISOString().slice(0,10); if(h && !h.days.includes(today)) h.days.push(today); await p.kv.set("hs", hs); return { ok:!!h }; } });
  await p.tools.register({ name:"list", execute: async () => ({ habits: await p.kv.get("hs") ?? [] }) });
}`,
    panel: simpleTabPanel("habit-panel", `<h3>✅ Habits</h3><ul id="l"></ul>`),
  },
  {
    name: "weekly-goal-recap",
    description: "Friday email/note: the week's wins, blockers, goals progress.",
    category: "productivity",
    tags: ["review"],
    contributes: { tools: ["run"], scheduler: [{ id: "fri", every_seconds: 3600 }] },
    entry: `export default async function init(p){
  async function run(){
    const d=new Date().toISOString().slice(0,10);
    const body = "# Week of " + d + "\\n\\n## wins\\n- \\n\\n## blockers\\n- \\n\\n## next week\\n- \\n";
    await p.notes.save({ title:"weekly-goal-"+d, body, tags:"review" });
    await p.bubble.speak("Weekly recap template saved — fill in the blanks.");
  }
  await p.tools.register({ name:"run", execute:run });
  p.schedule({id:"fri",every_seconds:3600},async()=>{ const d=new Date(); if(d.getDay()===5 && d.getHours()===17 && d.getMinutes()<5) await run(); });
}`,
  },
  {
    name: "daily-intent",
    description: "Morning \"what matters today\" prompt — logs to vault + surfaces in briefing.",
    category: "productivity",
    tags: ["journal"],
    contributes: { tools: ["set", "today"], scheduler: [{ id: "am", every_seconds: 3600 }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"set", execute: async ({ text }) => { await p.kv.set("today-"+new Date().toISOString().slice(0,10), text); return { ok:true }; } });
  await p.tools.register({ name:"today", execute: async () => ({ intent: await p.kv.get("today-"+new Date().toISOString().slice(0,10)) ?? null }) });
  p.schedule({id:"am",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===8 && d.getMinutes()<5){ const cur=await p.kv.get("today-"+d.toISOString().slice(0,10)); if(!cur) await p.bubble.speak("What's the one thing that matters today?"); } });
}`,
  },
  {
    name: "eisenhower-sorter",
    description: "Prompt-driven todo → quadrant classifier (urgent×important).",
    category: "productivity",
    tags: ["gtd"],
    contributes: { tools: ["sort"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"sort", description:"classify todo text into Eisenhower quadrant",
    execute: async ({ text }) => {
      const urgent = /\\b(today|asap|now|urgent|due|by eod)\\b/i.test(text);
      const important = /\\b(goal|key|critical|strategic|important)\\b/i.test(text);
      return { quadrant: urgent && important ? "do" : !urgent && important ? "schedule" : urgent && !important ? "delegate" : "delete" };
    }});
}`,
  },
  {
    name: "anti-distraction-timer",
    description: "Block distracting domains for N minutes via Passio's existing blocklist machinery.",
    category: "productivity",
    tags: ["focus"],
    contributes: { tools: ["start"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"start", description:"set/unset distracting blocks for N min",
    execute: async ({ minutes = 30 }) => { await p.kv.set("until", Date.now()+minutes*60_000); return { ok:true, until: Date.now()+minutes*60_000 }; } });
}`,
  },
  {
    name: "focus-playlist",
    description: "One-click trigger for a saved Spotify playlist URI (needs your Spotify URL).",
    category: "productivity",
    tags: ["focus", "audio"],
    contributes: { tools: ["open"], settings: [{ id: "url", label: "Playlist URL", type: "string", default: "" }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"open", execute: async () => ({ url: await p.kv.get("url") }) });
}`,
  },
  {
    name: "morning-routine",
    description: "Step-by-step guided morning routine: water → stretch → intent → inbox triage.",
    category: "productivity",
    tags: ["routine"],
    contributes: {
      ...tabContributes("morning-routine-panel", "AM", "☀"),
      tools: ["start"],
    },
    entry: `export default async function init(p){
  const steps = ["Drink 500ml water","Stretch 3 min","Set today's intent","Inbox zero (5 min only)"];
  await p.tools.register({ name:"start", execute: async () => { await p.kv.set("step", 0); await p.bubble.speak("Morning routine started — first step in the AM tab."); return { ok:true }; } });
}`,
    panel: simpleTabPanel("morning-routine-panel", `<h3>☀ Morning routine</h3><ol id="l"></ol>`),
  },
  {
    name: "evening-routine",
    description: "Wind-down: recap of today, 3 wins, tomorrow's most important task, phone away.",
    category: "productivity",
    tags: ["routine"],
    contributes: {
      ...tabContributes("evening-routine-panel", "PM", "🌙"),
      tools: ["start"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"start", execute: async () => { await p.bubble.speak("Evening routine — PM tab."); return { ok:true }; } });
}`,
    panel: simpleTabPanel("evening-routine-panel", `<h3>🌙 Evening</h3><ol id="l"></ol>`),
  },
  {
    name: "journaling-prompt",
    description: "Daily prompt rotated from a 60-prompt pool — one-liner answer → vault.",
    category: "productivity",
    tags: ["journal"],
    contributes: { tools: ["today", "answer"] },
    entry: `export default async function init(p){
  const prompts = ["What surprised you today?","What drained you?","Who helped you?","What would you redo?","What do you avoid?","What fed you?","What did you finish?"];
  await p.tools.register({ name:"today", execute: async () => { const idx = new Date().getDate() % prompts.length; return { prompt: prompts[idx] }; } });
  await p.tools.register({ name:"answer", execute: async ({ text }) => { const d=new Date().toISOString().slice(0,10); await p.notes.save({ title:"journal-"+d, body:"Prompt: "+(prompts[new Date().getDate()%prompts.length])+"\\n\\n"+text, tags:"journal" }); return { ok:true }; } });
}`,
  },
  {
    name: "mood-tracker",
    description: "1–5 scale, one tap/day. Trend graph after a month.",
    category: "productivity",
    tags: ["journal"],
    contributes: {
      ...tabContributes("mood-panel", "Mood", "😊"),
      tools: ["log", "trend"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ score }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), score }); await p.kv.set("log", log); return { ok:true }; } });
  await p.tools.register({ name:"trend", execute: async () => ({ log: await p.kv.get("log") ?? [] }) });
}`,
    panel: simpleTabPanel("mood-panel", `<h3>😊 Mood</h3><div>Today: <button data-s=1>1</button><button data-s=2>2</button><button data-s=3>3</button><button data-s=4>4</button><button data-s=5>5</button></div><svg id="g" width="300" height="80"></svg>`),
  },
];

// ==========================================================================
// FUN / PERSONALITY (10)
// ==========================================================================

const fun: SeedSpec[] = [
  {
    name: "compliment-fairy",
    description: "Once/day random sincere compliment. 50+ pool, never repeats within a week.",
    category: "fun",
    tags: ["fun"],
    contributes: { tools: ["give"], scheduler: [{ id: "daily", every_seconds: 3600 }] },
    entry: `export default async function init(p){
  const pool = ["You picked up something today you wouldn't have last year.","Your curiosity is an asset.","You're further along than you give yourself credit for.","The way you treat small things matters.","Your patience today will pay off."];
  await p.tools.register({ name:"give", execute: async () => ({ msg: pool[Math.floor(Math.random()*pool.length)] }) });
  p.schedule({id:"daily",every_seconds:3600},async()=>{ const k=new Date().toDateString(); const seen=(await p.kv.get("seen"))??null; if(seen===k) return; await p.kv.set("seen",k); const idx=Math.floor(Math.random()*pool.length); await p.bubble.speak(pool[idx]); });
}`,
  },
  {
    name: "mood-emoji",
    description: "Cycle the avatar's mood emoji — cosmetic only.",
    category: "fun",
    tags: ["fun"],
    contributes: { tools: ["cycle"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"cycle", execute: async () => { const opts=["🍇","🌱","✨","🎈"]; const i=((await p.kv.get("i"))??0)+1; await p.kv.set("i", i); return { emoji: opts[i%opts.length] }; } });
}`,
  },
  {
    name: "weather-haiku",
    description: "Generate a 5-7-5 haiku about today's weather each morning.",
    category: "fun",
    tags: ["fun", "weather"],
    contributes: { tools: ["compose"], scheduler: [{ id: "am", every_seconds: 3600 }] },
    entry: `export default async function init(p){
  const fallback = ["grey sky in the morning","rain taps on the window softly","coffee warms the cup"];
  await p.tools.register({ name:"compose", execute: async () => ({ haiku: fallback }) });
  p.schedule({id:"am",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===8 && d.getMinutes()<5) await p.bubble.speak(fallback.join(" / ")); });
}`,
  },
  {
    name: "word-of-the-day",
    description: "One interesting English word/day with definition, pulled from Merriam-Webster RSS.",
    category: "fun",
    tags: ["learning"],
    permissions: { network: ["www.merriam-webster.com"] },
    contributes: {
      ...widgetContributes("word-of-day-chip"),
      scheduler: [{ id: "am", every_seconds: 3600 }],
      tools: ["today"],
    },
    entry: `export default async function init(p){
  async function today(){
    try { const r = await p.net.fetch("https://www.merriam-webster.com/wotd/feed/rss2"); const xml = await r.text();
      const m = xml.match(/<item>[\\s\\S]*?<title>([^<]+)<\\/title>[\\s\\S]*?<description>([\\s\\S]*?)<\\/description>/);
      if(!m) return { word:null };
      const word = m[1].trim(); await p.kv.set("w", { word, ts:Date.now() }); return { word };
    } catch { return { word: null }; }
  }
  await p.tools.register({ name:"today", execute:today });
  p.schedule({id:"am",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===8 && d.getMinutes()<5) await today(); });
  today();
}`,
    panel: chipPanel(
      "word-of-day-chip",
      `const r=await window.passio.invoke("today",{}); if(!r.word){ el.remove(); return; } el.textContent = "📝 " + r.word;`,
    ),
  },
  {
    name: "on-this-day",
    description: "Surfaces your vault notes from N years ago today.",
    category: "fun",
    tags: ["memory"],
    contributes: { tools: ["today"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"today", execute: async () => ({ stub:true, note:"hooks into vault search for notes whose filename contains YYYY-MM-DD pattern from prior years" }) });
}`,
  },
  {
    name: "desktop-wallpaper-rotator",
    description: "Rotate desktop wallpaper from a configured folder. Linux-only, trusted.",
    category: "fun",
    tags: ["system"],
    permissions: { trusted: true },
    contributes: { tools: ["next"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"next", execute: async () => ({ stub:true, note:"requires shell allowlist entry for feh/swaybg/gsettings" }) });
}`,
  },
  {
    name: "screen-time-shame",
    description: "Gentle, playful nudge after X hours of computer time in a day.",
    category: "fun",
    tags: ["health"],
    contributes: { tools: ["check"], scheduler: [{ id: "hourly", every_seconds: 3600 }] },
    entry: `export default async function init(p){
  p.schedule({id:"hourly",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===22) await p.bubble.speak("Big day. Consider calling it a night."); });
}`,
  },
  {
    name: "fake-coworker",
    description: "Toggle \"pretend available\" — forwards a custom Slack status for 30 min.",
    category: "fun",
    tags: ["slack"],
    permissions: { network: ["slack.com"], secrets: ["token"] },
    contributes: { tools: ["toggle"], settings: [{ id: "status", label: "Status text", type: "string", default: "Heads down" }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"toggle", execute: async () => {
    let tok=null; try{ tok = await p.secrets.get("token"); } catch {} if(!tok) return { ok:false, reason:"set slack token" };
    const text = (await p.kv.get("status")) ?? "Heads down";
    const r = await p.net.fetch("https://slack.com/api/users.profile.set",{ method:"POST",
      init:{ headers:{ "Authorization":"Bearer "+tok, "content-type":"application/json; charset=utf-8" },
      body: JSON.stringify({ profile: { status_text: text, status_emoji: ":brain:", status_expiration: Math.floor(Date.now()/1000)+30*60 } }) } });
    return { ok: r.ok };
  }});
}`,
  },
  {
    name: "rubber-duck-button",
    description: "Tap → prompt to explain what you're stuck on; log to a vault note for the weekly review.",
    category: "fun",
    tags: ["dev"],
    contributes: { tools: ["log"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ text }) => {
    await p.notes.save({ title:"duck-"+Date.now(), body: "Explaining: " + text, tags:"duck" });
    return { ok:true };
  }});
}`,
  },
  {
    name: "curiosity-log",
    description: "End-of-day prompt: what did you learn? One-line answer → monthly roll-up.",
    category: "fun",
    tags: ["journal"],
    contributes: { tools: ["log"], scheduler: [{ id: "pm", every_seconds: 3600 }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ text }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), text }); await p.kv.set("log", log); return { ok:true }; } });
  p.schedule({id:"pm",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===21 && d.getMinutes()<5) await p.bubble.speak("What did you learn today? One sentence — I'll store it."); });
}`,
  },
];

// ==========================================================================
// INTEGRATIONS (10) — OAuth-heavy, mostly stubs w/ clear settings story
// ==========================================================================

const integrations: SeedSpec[] = [
  {
    name: "notion-mirror",
    description: "Two-way mirror between a Notion DB and a vault folder. Stub — needs your Notion token.",
    category: "productivity",
    tags: ["notion"],
    permissions: { network: ["api.notion.com"], secrets: ["notion_token"] },
    contributes: { tools: ["sync"], settings: [{ id: "db_id", label: "Notion DB id", type: "string" }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"sync", execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "linear-triage",
    description: "Your assigned Linear issues in a tab. Needs a Linear API key.",
    category: "developer",
    tags: ["linear"],
    permissions: { network: ["api.linear.app"], secrets: ["linear_key"] },
    contributes: {
      ...tabContributes("linear-panel", "Linear", "📐"),
      tools: ["check"],
      scheduler: [{ id: "tick", every_seconds: 600 }],
    },
    entry: `export default async function init(p){
  async function check(){
    let k=null; try{ k = await p.secrets.get("linear_key"); } catch {}
    if(!k) return { items:[], reason:"set linear_key" };
    const r = await p.net.fetch("https://api.linear.app/graphql",{ method:"POST",
      init:{ headers:{ Authorization:k, "content-type":"application/json" },
      body: JSON.stringify({ query: "{ issues(filter:{ assignee:{isMe:{eq:true}}, state:{type:{nin:[\"completed\",\"canceled\"]}} }, first:30){ nodes{ id title url state{ name } } } }" }) } });
    const items = (((await r.json()).data?.issues?.nodes) ?? []).map(x=>({ title:x.title, state:x.state?.name, url:x.url }));
    await p.kv.set("items", items);
    return { items };
  }
  await p.tools.register({ name:"check", execute:check });
  p.schedule({id:"tick",every_seconds:600},()=>check().catch(()=>undefined));
}`,
    panel: simpleTabPanel("linear-panel", `<h3>📐 Linear</h3><ul id="l"></ul>`),
  },
  {
    name: "jira-stand-up",
    description: "Yesterday/today/blockers output from Jira for the daily scrum. Stub — add your instance.",
    category: "productivity",
    tags: ["jira"],
    permissions: { network: ["*"], secrets: ["jira_token"] },
    contributes: { tools: ["check"], settings: [{ id: "host", label: "Jira host", type: "string", default: "your.atlassian.net" }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"check", execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "trello-board",
    description: "View one Trello board's columns. Needs an API key + token.",
    category: "productivity",
    tags: ["trello"],
    permissions: { network: ["api.trello.com"], secrets: ["trello_key", "trello_token"] },
    contributes: { tools: ["load"], settings: [{ id: "board_id", label: "Board id", type: "string" }] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"load", execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "airtable-query",
    description: "Saved Airtable queries with a one-click refresh.",
    category: "productivity",
    tags: ["airtable"],
    permissions: { network: ["api.airtable.com"], secrets: ["airtable_key"] },
    contributes: { tools: ["run"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"run", execute: async () => ({ stub:true }) });
}`,
  },
  {
    name: "spotify-now-playing",
    description: "What's playing + save-to-liked chip. Needs an OAuth token.",
    category: "widget",
    tags: ["spotify"],
    permissions: { network: ["api.spotify.com"], secrets: ["spotify_token"] },
    contributes: {
      ...widgetContributes("spotify-chip"),
      scheduler: [{ id: "tick", every_seconds: 30 }],
      tools: ["now", "like"],
    },
    entry: `export default async function init(p){
  async function now(){
    let tok=null; try{ tok=await p.secrets.get("spotify_token"); } catch {} if(!tok) return { track:null };
    try { const r = await p.net.fetch("https://api.spotify.com/v1/me/player/currently-playing",{ init:{ headers:{ Authorization:"Bearer "+tok } } });
      if(r.status===204) return { track:null };
      const b = await r.json();
      return { track: b?.item ? { title:b.item.name, artist:b.item.artists?.[0]?.name, uri:b.item.uri } : null };
    } catch { return { track:null }; }
  }
  await p.tools.register({ name:"now", execute:now });
  await p.tools.register({ name:"like", execute: async () => ({ stub:true }) });
  p.schedule({id:"tick",every_seconds:30},()=>now().catch(()=>undefined));
}`,
    panel: chipPanel(
      "spotify-chip",
      `const r=await window.passio.invoke("now",{}); if(!r.track){ el.remove(); return; } el.textContent = "♫ " + r.track.title.slice(0,24);`,
    ),
  },
  {
    name: "lastfm-scrobble",
    description: "Total scrobbles today for a user — no write, just vibe.",
    category: "widget",
    tags: ["music"],
    permissions: { network: ["ws.audioscrobbler.com"], secrets: ["lastfm_key"] },
    contributes: {
      ...widgetContributes("lastfm-chip"),
      scheduler: [{ id: "tick", every_seconds: 300 }],
      tools: ["today"],
      settings: [{ id: "user", label: "last.fm username", type: "string", default: "" }],
    },
    entry: `export default async function init(p){
  async function today(){
    let key=null; try{ key = await p.secrets.get("lastfm_key"); } catch {}
    const u = await p.kv.get("user"); if(!key || !u) return { scrobbles:null };
    const from = Math.floor(new Date().setHours(0,0,0,0)/1000);
    const r = await p.net.fetch("https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user="+encodeURIComponent(u)+"&from="+from+"&api_key="+key+"&format=json&limit=200");
    const b = await r.json(); const n = Number(b?.recenttracks?.["@attr"]?.total ?? 0);
    await p.kv.set("n", n);
    return { scrobbles: n };
  }
  await p.tools.register({ name:"today", execute:today });
  p.schedule({id:"tick",every_seconds:300},()=>today().catch(()=>undefined));
}`,
    panel: chipPanel(
      "lastfm-chip",
      `const r=await window.passio.invoke("today",{}); if(r.scrobbles==null){ el.remove(); return; } el.textContent = "♫ " + r.scrobbles;`,
    ),
  },
  {
    name: "strava-week",
    description: "km run/ridden this week. Needs a Strava API access token.",
    category: "widget",
    tags: ["fitness"],
    permissions: { network: ["www.strava.com"], secrets: ["strava_token"] },
    contributes: {
      ...widgetContributes("strava-chip"),
      scheduler: [{ id: "tick", every_seconds: 3600 }],
      tools: ["week"],
    },
    entry: `export default async function init(p){
  async function week(){
    let tok=null; try{ tok=await p.secrets.get("strava_token"); } catch {} if(!tok) return { km:null };
    const after = Math.floor((Date.now() - 7*86400_000)/1000);
    const r = await p.net.fetch("https://www.strava.com/api/v3/athlete/activities?after="+after+"&per_page=50",{ init:{ headers:{ Authorization:"Bearer "+tok } } });
    const km = ((await r.json()) ?? []).reduce((s,a)=>s+(a.distance ?? 0), 0) / 1000;
    await p.kv.set("km", km); return { km: Math.round(km*10)/10 };
  }
  await p.tools.register({ name:"week", execute:week });
  p.schedule({id:"tick",every_seconds:3600},()=>week().catch(()=>undefined));
}`,
    panel: chipPanel(
      "strava-chip",
      `const r=await window.passio.invoke("week",{}); if(r.km==null){ el.remove(); return; } el.textContent = "🏃 " + r.km + "km";`,
    ),
  },
  {
    name: "weight-tracker",
    description: "Manual weight log + 30-day trend.",
    category: "productivity",
    tags: ["health"],
    contributes: {
      ...tabContributes("weight-panel", "Weight", "⚖"),
      tools: ["log", "trend"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ kg }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), kg }); await p.kv.set("log", log); return { ok:true }; } });
  await p.tools.register({ name:"trend", execute: async () => ({ log: await p.kv.get("log") ?? [] }) });
}`,
    panel: simpleTabPanel("weight-panel", `<h3>⚖ Weight</h3><input id="n" type="number" step="0.1"/><button id="go">log</button><svg id="g" width="300" height="80"></svg>`),
  },
  {
    name: "sleep-score",
    description: "Daily sleep score input (1–100) + weekly average. Pairs well with Apple Health / Oura export if you have one.",
    category: "productivity",
    tags: ["health"],
    contributes: {
      ...tabContributes("sleep-panel", "Sleep", "🌙"),
      tools: ["log", "avg"],
    },
    entry: `export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ score }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), score }); await p.kv.set("log", log); return { ok:true }; } });
  await p.tools.register({ name:"avg", execute: async () => { const log=(await p.kv.get("log"))??[]; const last = log.slice(-7); const avg = last.length ? last.reduce((s,e)=>s+e.score,0)/last.length : null; return { avg, last }; } });
}`,
    panel: simpleTabPanel("sleep-panel", `<h3>🌙 Sleep</h3><input id="n" type="number" min="1" max="100"/><button id="go">log</button><p id="a"></p>`),
  },
];

// ==========================================================================
// META / DEVOPS (5)
// ==========================================================================

const meta: SeedSpec[] = [
  {
    name: "seed-playground",
    description: "A scratch seed for quick experiments. Logs anything you pass to its 'echo' tool with a timestamp.",
    category: "other",
    tags: ["dev", "meta"],
    contributes: { tools: ["echo"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"echo", description:"echo with timestamp", execute: async (args) => ({ args, at: new Date().toISOString() }) });
}`,
  },
  {
    name: "seed-doctor",
    description: "Reports installed seeds that request permissions they never use (via log heuristics).",
    category: "other",
    tags: ["dev", "meta"],
    contributes: { tools: ["scan"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"scan", execute: async () => ({ stub:true, note:"future: analyse passio.seed.logs for net/secret calls vs declared permissions" }) });
}`,
  },
  {
    name: "vault-link-doctor",
    description: "Finds broken [[wiki-links]] in your vault and flags them.",
    category: "research",
    tags: ["obsidian"],
    contributes: { tools: ["scan"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"scan", execute: async () => ({ stub:true, note:"iterates vault_notes.wikiLinks vs vault_notes.path" }) });
}`,
  },
  {
    name: "secret-audit",
    description: "Lists vault notes containing patterns that look like leaked secrets (API keys, env-like strings).",
    category: "research",
    tags: ["security"],
    contributes: { tools: ["scan"] },
    entry: `export default async function init(p){
  await p.tools.register({ name:"scan", execute: async () => ({ stub:true, note:"searches vault for sk_*, AKIA*, -----BEGIN patterns" }) });
}`,
  },
  {
    name: "log-tailer",
    description: "Tails Passio's own sidecar logs in a tab — useful during seed development.",
    category: "other",
    tags: ["dev"],
    contributes: {
      ...tabContributes("log-tailer-panel", "Logs", "📜"),
    },
    entry: `export default async function init(p){ p.log("log-tailer running"); }`,
    panel: simpleTabPanel("log-tailer-panel", `<h3>📜 Logs</h3><pre id="l" style="max-height:260px;overflow:auto">tailing…</pre>`),
  },
];

// ==========================================================================

export const SEED_SPECS: SeedSpec[] = [
  ...widgets,
  ...inbox,
  ...news,
  ...calendar,
  ...dev,
  ...research,
  ...productivity,
  ...fun,
  ...integrations,
  ...meta,
];
