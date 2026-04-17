/**
 * Tool implementations invoked by the background service worker when it
 * receives a `request` from the sidecar. Each tool returns a JSON-serialisable
 * result or throws. All DOM work runs via chrome.scripting.executeScript in
 * the target tab's MAIN world (so Readability can access window/DOM).
 */

export async function getCurrentTab(): Promise<{
  url: string;
  title: string;
  tabId: number;
}> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("no active tab");
  return { url: tab.url ?? "", title: tab.title ?? "", tabId: tab.id };
}

export async function getAllTabs(): Promise<{
  tabs: Array<{ url: string; title: string; tabId: number; active: boolean }>;
}> {
  const tabs = await chrome.tabs.query({});
  return {
    tabs: tabs
      .filter((t) => typeof t.id === "number")
      .map((t) => ({
        tabId: t.id as number,
        url: t.url ?? "",
        title: t.title ?? "",
        active: t.active ?? false,
      })),
  };
}

export async function navigate(params: { url: string; tabId?: number }): Promise<{ ok: true }> {
  const tabId = params.tabId ?? (await getCurrentTab()).tabId;
  await chrome.tabs.update(tabId, { url: params.url });
  return { ok: true };
}

export async function newTab(params: { url?: string }): Promise<{ tabId: number }> {
  const tab = await chrome.tabs.create(params.url ? { url: params.url } : {});
  if (typeof tab.id !== "number") throw new Error("new tab returned no id");
  return { tabId: tab.id };
}

export async function closeTab(params: { tabId?: number }): Promise<{ ok: true }> {
  const tabId = params.tabId ?? (await getCurrentTab()).tabId;
  await chrome.tabs.remove(tabId);
  return { ok: true };
}

export async function scroll(params: {
  direction: "up" | "down" | "top" | "bottom";
  amount?: number;
  tabId?: number;
}): Promise<{ ok: true }> {
  const tabId = params.tabId ?? (await getCurrentTab()).tabId;
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (dir: string, amt: number | undefined) => {
      const step = amt ?? Math.round(window.innerHeight * 0.8);
      if (dir === "top") window.scrollTo({ top: 0, behavior: "smooth" });
      else if (dir === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      else if (dir === "up") window.scrollBy({ top: -step, behavior: "smooth" });
      else window.scrollBy({ top: step, behavior: "smooth" });
    },
    args: [params.direction, params.amount],
  });
  return { ok: true };
}

export async function click(params: { selector: string; tabId?: number }): Promise<{ ok: true }> {
  const tabId = params.tabId ?? (await getCurrentTab()).tabId;
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return { ok: false, reason: `selector not found: ${sel}` };
      el.scrollIntoView({ block: "center", behavior: "auto" });
      el.click();
      return { ok: true };
    },
    args: [params.selector],
  });
  const r = injected[0]?.result as { ok: boolean; reason?: string } | undefined;
  if (!r?.ok) throw new Error(r?.reason ?? "click failed");
  return { ok: true };
}

export async function typeText(params: {
  selector: string;
  text: string;
  tabId?: number;
}): Promise<{ ok: true }> {
  const tabId = params.tabId ?? (await getCurrentTab()).tabId;
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (sel: string, text: string) => {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
      if (!el) return { ok: false, reason: `selector not found: ${sel}` };
      el.focus();
      const proto =
        el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    },
    args: [params.selector, params.text],
  });
  const r = injected[0]?.result as { ok: boolean; reason?: string } | undefined;
  if (!r?.ok) throw new Error(r?.reason ?? "type failed");
  return { ok: true };
}

export async function extract(params: { tabId?: number }): Promise<{
  url: string;
  title: string;
  text: string;
  byline?: string;
  length: number;
}> {
  const tabId = params.tabId ?? (await getCurrentTab()).tabId;
  // Content script is injected on-demand with Readability pre-bundled.
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "passio.extract" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.ok !== true) {
        reject(new Error(response?.error ?? "extract failed"));
        return;
      }
      resolve(response.result);
    });
  });
}

export async function screenshot(params: { tabId?: number }): Promise<{ dataUrl: string }> {
  // captureVisibleTab takes a windowId, not a tabId; if the target tab
  // isn't in the current window we focus it first.
  const target = params.tabId
    ? await chrome.tabs.get(params.tabId)
    : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!target?.windowId) throw new Error("tab has no window");
  const dataUrl = await chrome.tabs.captureVisibleTab(target.windowId, { format: "png" });
  return { dataUrl };
}
