import { getPairing, setPairing } from "./storage.js";

async function prefill() {
  const existing = await getPairing();
  if (!existing) return;
  (document.getElementById("port") as HTMLInputElement).value = String(existing.port);
  (document.getElementById("token") as HTMLInputElement).value = existing.token;
}

document.getElementById("save")!.addEventListener("click", async () => {
  const portRaw = (document.getElementById("port") as HTMLInputElement).value.trim();
  const token = (document.getElementById("token") as HTMLInputElement).value.trim();
  const status = document.getElementById("status") as HTMLElement;
  const port = Number(portRaw);
  if (!port || Number.isNaN(port) || !token) {
    status.textContent = "Both port and token are required.";
    status.className = "err";
    return;
  }
  await setPairing({ port, token });
  status.textContent = "Saved. Reconnecting…";
  status.className = "";
  await chrome.runtime.sendMessage({ type: "passio.reconnect" });
});

void prefill();
