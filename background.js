const APP = {
  expectedIp: "10.10.10.10",
  reportUrl: "https://nt-r.cuhk.edu.cn/",
  speedtestUrl: "https://nt-r.cuhk.edu.cn/speedtest",
  reportFrameUrl: "https://nt-r.cuhk.edu.cn/#cuhksz-ext-report",
  speedtestFrameUrl: "https://nt-r.cuhk.edu.cn/speedtest#cuhksz-ext-speedtest",
  reportWaitMs: 25000,
  probeWaitMs: 15000,
  speedtestWaitMs: 180000,
  storageKey: "workflowState",
  notificationId: "cuhksz-speedtest",
  offscreenPath: "offscreen.html"
};

const NOTIFICATION_ICON_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#bc4b1f"/>
          <stop offset="100%" stop-color="#d07a32"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="#f6efe2"/>
      <circle cx="64" cy="64" r="42" fill="none" stroke="url(#g)" stroke-width="10"/>
      <path d="M32 84 L64 48 L82 66 L96 42" fill="none" stroke="#1b2b34" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `);

let workflow = {
  running: false,
  phase: "idle",
  message: "Idle",
  detail: "No test has been started yet.",
  reportRequestSeen: false,
  probeStarted: false,
  reportFrameReady: false,
  reportScrapeStarted: false,
  speedtestFrameReady: false,
  speedtestStarted: false,
  resolvedIp: "",
  report: null,
  resultText: "",
  speedtest: null,
  finishedAt: ""
};

let creatingOffscreen = null;

function setStorage(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [APP.storageKey]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([APP.storageKey], (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items[APP.storageKey] || null);
    });
  });
}

function createNotification(options) {
  return new Promise((resolve, reject) => {
    chrome.notifications.create(APP.notificationId, options, (notificationId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(notificationId);
    });
  });
}

async function persistWorkflow() {
  const snapshot = {
    running: workflow.running,
    phase: workflow.phase,
    message: workflow.message,
    detail: workflow.detail,
    resultText: workflow.resultText,
    finishedAt: workflow.finishedAt
  };

  await setStorage(snapshot).catch(() => {});
}

async function setWorkflow(patch) {
  workflow = {
    ...workflow,
    ...patch
  };
  await persistWorkflow();
}

async function resetWorkflow(patch = {}) {
  workflow = {
    running: false,
    phase: "idle",
    message: "Idle",
    detail: "No test has been started yet.",
    reportRequestSeen: false,
    probeStarted: false,
    reportFrameReady: false,
    reportScrapeStarted: false,
    speedtestFrameReady: false,
    speedtestStarted: false,
    resolvedIp: "",
    report: null,
    resultText: "",
    speedtest: null,
    finishedAt: "",
    ...patch
  };
  await persistWorkflow();
}

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(APP.offscreenPath);

  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    return contexts.length > 0;
  }

  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: APP.offscreenPath,
    reasons: ["IFRAME_SCRIPTING", "DOM_SCRAPING"],
    justification: "Run the CUHK-Shenzhen report and speedtest in a hidden document."
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function closeOffscreenDocument() {
  try {
    if (await hasOffscreenDocument()) {
      await chrome.offscreen.closeDocument();
    }
  } catch (_) {}
}

function sendMessageToOffscreen(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        ...message,
        target: "offscreen"
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      }
    );
  });
}

function buildResultText(report, speedtest, resolvedIp) {
  speedtest = speedtest || {};
  const escapeTomlString = (value) =>
    String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, " ");

  const asTomlString = (value) => `"${escapeTomlString(value)}"`;
  const asTomlBoolean = (value) => (value ? "true" : "false");
  const asTomlNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? String(parsed) : asTomlString("Unknown");
  };
  const asTomlIntegerOrString = (value) => {
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return value.trim();
    }
    return asTomlString(value || "Unknown");
  };
  const asTomlText = (value, fallback = "Unknown") => asTomlString(value || fallback);
  const hasMeaningfulValue = (value) => {
    if (value == null) {
      return false;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return false;
    }

    return normalized !== "Unknown" && normalized !== "None";
  };

  const sections = [
    "[network_check]",
    `host = "nt-r.cuhk.edu.cn"`,
    `passed = ${asTomlBoolean(Boolean(resolvedIp) && resolvedIp === APP.expectedIp)}`,
    `reachable = ${asTomlBoolean(Boolean(resolvedIp))}`,
    "",
    "[home_report]",
    `test_id = ${asTomlIntegerOrString(report.testId)}`,
    `time = ${asTomlText(report.time)}`,
    `network_type = ${asTomlText(report.networkType)}`,
    `location = ${asTomlText(report.location)}`,
    `account = ${asTomlText(report.account)}`,
    `ipv4_address = ${asTomlText(report.ipv4)}`,
    `ipv6_address = ${asTomlText(report.ipv6)}`,
    `ping_cn_bing = ${asTomlText(report.pingBing)}`,
    `ping_google_hk = ${asTomlText(report.pingGoogle)}`,
    `ping_i_cuhk = ${asTomlText(report.pingCuhk)}`,
    `vpn_group = ${asTomlText(report.vpnGroup)}`,
    `vpn_policy = ${asTomlText(report.vpnPolicy)}`,
    "",
    "[speed_test]",
    `ping_ms = ${asTomlNumber(speedtest.ping)}`,
    `jitter_ms = ${asTomlNumber(speedtest.jitter)}`,
    `download_mbps = ${asTomlNumber(speedtest.download)}`,
    `upload_mbps = ${asTomlNumber(speedtest.upload)}`,
    `campus_ip_address = ${asTomlText(speedtest.campusIp)}`
  ];

  if (hasMeaningfulValue(speedtest.resultTestId)) {
    sections.push(`test_id = ${asTomlText(speedtest.resultTestId)}`);
  }

  if (hasMeaningfulValue(speedtest.resultUrl)) {
    sections.push(`result_link = ${asTomlText(speedtest.resultUrl)}`);
  }

  return sections.join("\n");
}

async function notify(title, message, contextMessage = "") {
  await createNotification({
    type: "basic",
    title,
    message,
    contextMessage,
    iconUrl: NOTIFICATION_ICON_URL,
    requireInteraction: false,
    silent: false
  }).catch(() => {});
}

async function failWorkflow(detail) {
  const message = typeof detail === "string" ? detail : String(detail);

  await setWorkflow({
    running: false,
    phase: "error",
    message: "Test Failed",
    detail: message,
    finishedAt: new Date().toISOString()
  });

  await closeOffscreenDocument();
  await notify("CUHK-Shenzhen Speed Test Failed", message);
}

function isReportRequest(url) {
  return url === APP.reportUrl || url === APP.reportUrl.slice(0, -1);
}

async function probeCampusIp(timeoutMs) {
  const token = `ext_probe=${encodeURIComponent(crypto.randomUUID())}`;
  const separator = APP.reportUrl.includes("?") ? "&" : "?";
  const probeUrl = `${APP.reportUrl}${separator}${token}`;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      chrome.webRequest.onCompleted.removeListener(onCompleted);
      chrome.webRequest.onErrorOccurred.removeListener(onError);
    };

    const finishResolve = (value) => {
      cleanup();
      resolve(value);
    };

    const finishReject = (error) => {
      cleanup();
      reject(error);
    };

    const onCompleted = (details) => {
      if (!details.url.includes(token)) {
        return;
      }
      finishResolve(details.ip || "");
    };

    const onError = (details) => {
      if (!details.url.includes(token)) {
        return;
      }
      finishReject(new Error(`IP probe request failed: ${details.error}`));
    };

    const timer = setTimeout(() => {
      finishReject(new Error("Timed out while waiting for the IP probe result."));
    }, timeoutMs);

    chrome.webRequest.onCompleted.addListener(onCompleted, {
      urls: ["https://nt-r.cuhk.edu.cn/*"]
    });
    chrome.webRequest.onErrorOccurred.addListener(onError, {
      urls: ["https://nt-r.cuhk.edu.cn/*"]
    });

    void fetch(probeUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "omit"
    }).catch((error) => {
      finishReject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

async function startCampusIpProbe() {
  if (!workflow.running || workflow.probeStarted) {
    return;
  }

  workflow.probeStarted = true;
  await persistWorkflow();

  try {
    const resolvedIp = await probeCampusIp(APP.probeWaitMs);
    workflow.reportRequestSeen = true;
    workflow.resolvedIp = resolvedIp;
    await persistWorkflow();

    if (workflow.phase === "loadingReport" && !workflow.report) {
      await setWorkflow({
        message: "IP Probe Completed, Waiting for Home Page Fields",
        detail: `Resolved target address: ${resolvedIp || "Unknown IP"}. Waiting for the network report fields on the home page.`
      });
    }

    await maybeAdvanceToSpeedtest();
  } catch (error) {
    await failWorkflow(error instanceof Error ? error.message : String(error));
  }
}

async function maybeTriggerReportScrape() {
  if (!workflow.running || workflow.phase !== "loadingReport") {
    return;
  }

  if (!workflow.reportFrameReady || workflow.reportScrapeStarted) {
    return;
  }

  workflow.reportScrapeStarted = true;
  await persistWorkflow();

  try {
    const response = await sendMessageToOffscreen({
      type: "SCRAPE_REPORT",
      timeoutMs: APP.reportWaitMs
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to send the report scraping command.");
    }
  } catch (error) {
    await failWorkflow(error instanceof Error ? error.message : String(error));
  }
}

async function maybeAdvanceToSpeedtest() {
  if (!workflow.running || workflow.phase !== "loadingReport") {
    return;
  }

  if (!workflow.report || !workflow.reportRequestSeen) {
    if (workflow.report && !workflow.reportRequestSeen) {
      await setWorkflow({
        message: "Home Page Fields Captured, Waiting for IP Probe",
        detail: "The home page fields are ready. Waiting for the actual resolved IP of nt-r.cuhk.edu.cn."
      });
    }
    return;
  }

  if (workflow.resolvedIp !== APP.expectedIp) {
    await failWorkflow(
      `The current network did not resolve to the expected target 10.10.10.10. Actual result: ${workflow.resolvedIp || "Unknown IP"}.`
    );
    return;
  }

  await setWorkflow({
    phase: "loadingSpeedtest",
    message: "Opening the Speed Test",
    detail: "Campus network verification passed. Loading the speed test page.",
    speedtestFrameReady: false,
    speedtestStarted: false
  });

  try {
    const response = await sendMessageToOffscreen({
      type: "LOAD_SPEEDTEST",
      url: APP.speedtestFrameUrl
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to send the speed test page load command.");
    }
  } catch (error) {
    await failWorkflow(error instanceof Error ? error.message : String(error));
  }
}

async function startWorkflow() {
  if (workflow.running) {
    return { ok: true, started: false };
  }

  try {
    await ensureOffscreenDocument();
    await setWorkflow({
      running: true,
      phase: "loadingReport",
      message: "Checking Campus Network",
      detail: "Loading the home page and probing the actual resolved IP of nt-r.cuhk.edu.cn.",
      reportRequestSeen: false,
      probeStarted: false,
      reportFrameReady: false,
      reportScrapeStarted: false,
      speedtestFrameReady: false,
      speedtestStarted: false,
      resolvedIp: "",
      report: null,
      resultText: "",
      speedtest: null,
      finishedAt: ""
    });

    const response = await sendMessageToOffscreen({
      type: "LOAD_REPORT",
      url: APP.reportFrameUrl
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to send the report page load command.");
    }

    void startCampusIpProbe();
  } catch (error) {
    await closeOffscreenDocument();
    await resetWorkflow({
      phase: "error",
      message: "Failed to Start the Test",
      detail: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString()
    });
    throw error;
  }

  return { ok: true, started: true };
}

async function handleReportFrameReady() {
  if (!workflow.running || workflow.phase !== "loadingReport") {
    return;
  }

  workflow.reportFrameReady = true;
  await persistWorkflow();
  await maybeTriggerReportScrape();
}

async function handleReportReady(report) {
  if (!workflow.running || workflow.phase !== "loadingReport") {
    return;
  }

  await setWorkflow({
    message: workflow.reportRequestSeen ? "Verifying Network Environment" : "Home Page Fields Captured",
    detail: workflow.reportRequestSeen
      ? "The home page fields and IP probe result are both ready. Proceeding to the speed test page."
      : "The home page fields are ready. Waiting for the target IP probe result.",
    report
  });

  await maybeAdvanceToSpeedtest();
}

async function handleSpeedtestFrameReady() {
  if (!workflow.running || workflow.phase !== "loadingSpeedtest") {
    return;
  }

  await setWorkflow({
    phase: "runningSpeedtest",
    message: "Running the Speed Test",
    detail: "The speed test has started. The formatted result will appear here when it finishes.",
    speedtestFrameReady: true,
    speedtestStarted: true
  });

  try {
    const response = await sendMessageToOffscreen({
      type: "RUN_SPEEDTEST",
      timeoutMs: APP.speedtestWaitMs
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to send the speed test command.");
    }
  } catch (error) {
    await failWorkflow(error instanceof Error ? error.message : String(error));
  }
}

async function handleSpeedtestReady(speedtest) {
  if (!workflow.running || workflow.phase !== "runningSpeedtest") {
    return;
  }

  const resultText = buildResultText(workflow.report || {}, speedtest, workflow.resolvedIp);

  await setWorkflow({
    running: false,
    phase: "done",
    message: "Speed Test Completed",
    detail: "The result is ready below. Use Copy Result if you want it on the clipboard.",
    resultText,
    speedtest,
    finishedAt: new Date().toISOString()
  });

  await closeOffscreenDocument();
  await notify(
    "CUHK-Shenzhen Speed Test Completed",
    `Download ${speedtest?.download || "?"} Mbit/s, upload ${speedtest?.upload || "?"} Mbit/s`,
    "Open the extension popup to view or copy the result."
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") {
    return false;
  }

  if (message?.type === "START_TEST") {
    void startWorkflow()
      .then((response) => sendResponse(response))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  if (message?.type === "GET_STATE") {
    sendResponse({
      ok: true,
      state: {
        running: workflow.running,
        phase: workflow.phase,
        message: workflow.message,
        detail: workflow.detail,
        resultText: workflow.resultText,
        finishedAt: workflow.finishedAt
      }
    });
    return false;
  }

  if (message?.type === "OFFSCREEN_FRAME_READY") {
    if (message.page === "report") {
      void handleReportFrameReady();
    } else if (message.page === "speedtest") {
      void handleSpeedtestFrameReady();
    }
    return false;
  }

  if (message?.type === "REPORT_READY") {
    void handleReportReady(message.payload);
    return false;
  }

  if (message?.type === "SPEEDTEST_READY") {
    void handleSpeedtestReady(message.payload);
    return false;
  }

  if (message?.type === "OFFSCREEN_STEP_ERROR") {
    void failWorkflow(`${message.stage} failed: ${message.error}`);
    return false;
  }

  return false;
});

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!workflow.running || details.type !== "sub_frame") {
      return;
    }

    if (!details.url.startsWith("https://nt-r.cuhk.edu.cn/")) {
      return;
    }

    void failWorkflow(`Offscreen page load failed: ${details.error}`);
  },
  {
    urls: ["https://nt-r.cuhk.edu.cn/*"],
    types: ["sub_frame"]
  }
);

async function restoreWorkflow() {
  const snapshot = await getStorage().catch(() => null);
  if (!snapshot) {
    await persistWorkflow();
    return;
  }

  workflow = {
    ...workflow,
    running: false,
    phase: snapshot.phase || "idle",
    message: snapshot.message || "Idle",
    detail: snapshot.detail || "No test has been started yet.",
    resultText: snapshot.resultText || "",
    finishedAt: snapshot.finishedAt || ""
  };

  await closeOffscreenDocument();
  await persistWorkflow();
}

void restoreWorkflow();
