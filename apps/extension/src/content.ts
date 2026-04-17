import { Readability } from "@mozilla/readability";

/**
 * On-demand content script. Injected by the background SW via
 * chrome.scripting.executeScript only when needed (e.g. for extract).
 * Exits without side effects beyond a one-shot message listener.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "passio.extract") return;
  try {
    const cloned = document.cloneNode(true) as Document;
    const article = new Readability(cloned).parse();
    if (!article) {
      sendResponse({ ok: false, error: "readability returned null" });
      return true;
    }
    sendResponse({
      ok: true,
      result: {
        url: document.location.href,
        title: article.title ?? document.title,
        text: article.textContent ?? "",
        byline: article.byline ?? undefined,
        length: article.length ?? 0,
      },
    });
  } catch (e) {
    sendResponse({ ok: false, error: (e as Error).message });
  }
  return true;
});
