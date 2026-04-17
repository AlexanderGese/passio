interface StatusResponse {
  status: "idle" | "connecting" | "paired" | "unpaired" | "error";
  lastError: string | null;
}

async function refresh() {
  const resp = (await chrome.runtime.sendMessage({ type: "passio.get_status" })) as StatusResponse;
  const dot = document.getElementById("dot")!;
  const statusEl = document.getElementById("status")!;
  const pairedExtra = document.getElementById("paired-extra")!;
  const unpairedExtra = document.getElementById("unpaired-extra")!;

  dot.className = "dot";
  pairedExtra.style.display = "none";
  unpairedExtra.style.display = "none";

  switch (resp.status) {
    case "paired":
      dot.classList.add("ok");
      statusEl.textContent = "Paired with Passio";
      pairedExtra.style.display = "block";
      break;
    case "connecting":
      dot.classList.add("warn");
      statusEl.textContent = "Connecting…";
      break;
    case "unpaired":
      dot.classList.add("warn");
      statusEl.textContent = "Not paired yet";
      unpairedExtra.style.display = "block";
      break;
    case "error":
      statusEl.textContent = `Error: ${resp.lastError ?? "unknown"}`;
      unpairedExtra.style.display = "block";
      break;
    default:
      statusEl.textContent = "Offline — start Passio";
  }
}

document.getElementById("open-options")!.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "passio.status") void refresh();
});
void refresh();
