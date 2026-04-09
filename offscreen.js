const frame = document.getElementById("targetFrame");
const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;

let workflowStage = "idle";
let currentOrigin = "https://nt-r.cuhk.edu.cn";

function sendToBackground(message) {
  chrome.runtime.sendMessage(message);
}

function postCommandToFrame(type, payload = {}) {
  if (!frame.contentWindow) {
    throw new Error("The offscreen iframe is not ready yet.");
  }

  frame.contentWindow.postMessage(
    {
      source: "cuhksz-offscreen",
      type,
      ...payload
    },
    currentOrigin
  );
}

window.addEventListener("message", (event) => {
  if (event.origin !== currentOrigin || event.source !== frame.contentWindow) {
    return;
  }

  const data = event.data;
  if (!data || data.source !== "cuhksz-site-runner") {
    return;
  }

  if (data.type === "FRAME_READY") {
    sendToBackground({
      type: "OFFSCREEN_FRAME_READY",
      page: data.page
    });
    return;
  }

  if (data.type === "REPORT_READY") {
    sendToBackground({
      type: "REPORT_READY",
      payload: data.payload
    });
    return;
  }

  if (data.type === "SPEEDTEST_READY") {
    sendToBackground({
      type: "SPEEDTEST_READY",
      payload: data.payload
    });
    return;
  }

  if (data.type === "STEP_ERROR") {
    sendToBackground({
      type: "OFFSCREEN_STEP_ERROR",
      stage: data.stage,
      error: data.error
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }

  try {
    if (message.type === "LOAD_REPORT") {
      workflowStage = "loading-report";
      currentOrigin = new URL(message.url).origin;
      frame.src = message.url;
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "SCRAPE_REPORT") {
      workflowStage = "scraping-report";
      postCommandToFrame("SCRAPE_REPORT", {
        timeoutMs: message.timeoutMs
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "LOAD_SPEEDTEST") {
      workflowStage = "loading-speedtest";
      currentOrigin = new URL(message.url).origin;
      frame.src = message.url;
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "RUN_SPEEDTEST") {
      workflowStage = "running-speedtest";
      postCommandToFrame("RUN_SPEEDTEST", {
        timeoutMs: message.timeoutMs
      });
      sendResponse({ ok: true });
      return false;
    }

    sendResponse({ ok: false, error: `Unknown offscreen message: ${message.type}` });
    return false;
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
});
