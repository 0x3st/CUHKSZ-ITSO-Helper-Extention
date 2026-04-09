const launchButton = document.getElementById("launchButton");
const copyButton = document.getElementById("copyButton");
const hintText = document.getElementById("hintText");
const progressView = document.getElementById("progressView");
const resultView = document.getElementById("resultView");
const statusTitle = document.getElementById("statusTitle");
const statusDetail = document.getElementById("statusDetail");
const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");
const resultOutput = document.getElementById("resultOutput");
const STORAGE_KEY = "workflowState";
const DEFAULT_COPY_BUTTON_TEXT = "Copy Result";
let storageListener = null;
let copyButtonTimer = null;
let didInitialRender = false;

function readState() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY], (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items[STORAGE_KEY] || null);
    });
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function sanitizeLegacyText(snapshot) {
  if (!snapshot) {
    return snapshot;
  }

  const sanitized = { ...snapshot };
  const legacyMessageMap = new Map([
    ["测速完成，结果已复制到剪贴板", "Speed Test Completed"],
    ["测速失败", "Test Failed"],
    ["测速已完成，但复制失败", "Test Completed, but Copy Failed"],
    ["待命", "Idle"]
  ]);

  const legacyDetailMap = new Map([
    ["整个流程都在离屏文档里执行，没有创建站点标签页。", "The result is ready below."],
    ["尚未开始测试。", "No test has been started yet."]
  ]);

  if (legacyMessageMap.has(sanitized.message)) {
    sanitized.message = legacyMessageMap.get(sanitized.message);
  }

  if (legacyDetailMap.has(sanitized.detail)) {
    sanitized.detail = legacyDetailMap.get(sanitized.detail);
  }

  if (sanitized.phase === "done") {
    sanitized.message = "Speed Test Completed";
    sanitized.detail = "The result is ready below. Use Copy Result if you want it on the clipboard.";
  }

  return sanitized;
}

function getProgressMeta(snapshot) {
  if (!snapshot) {
    return { percent: 0, stateClass: "" };
  }

  if (snapshot.phase === "done") {
    return { percent: 100, stateClass: "is-done" };
  }

  if (snapshot.phase === "error") {
    if (snapshot.resultText) {
      return { percent: 96, stateClass: "is-error" };
    }
    return { percent: 32, stateClass: "is-error" };
  }

  if (snapshot.phase === "runningSpeedtest") {
    return { percent: 82, stateClass: "is-running" };
  }

  if (snapshot.phase === "loadingSpeedtest") {
    return { percent: 62, stateClass: "is-running" };
  }

  if (snapshot.phase === "loadingReport") {
    if ((snapshot.message || "").includes("Verifying")) {
      return { percent: 48, stateClass: "is-running" };
    }
    if ((snapshot.message || "").includes("Home Page Fields")) {
      return { percent: 38, stateClass: "is-running" };
    }
    if ((snapshot.message || "").includes("IP Probe Completed")) {
      return { percent: 28, stateClass: "is-running" };
    }
    return { percent: 16, stateClass: "is-running" };
  }

  return { percent: 0, stateClass: "" };
}

function showProgressView() {
  progressView.classList.remove("is-hidden");
  resultView.classList.add("is-hidden");
  hintText.classList.remove("is-hidden");
}

function showResultView() {
  resultView.classList.remove("is-hidden");
  progressView.classList.add("is-hidden");
  hintText.classList.add("is-hidden");
}

function renderProgressState(title, detail, percent, stateClass) {
  showProgressView();
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  progressFill.className = `progress-fill ${stateClass}`.trim();
}

function renderState(snapshot) {
  snapshot = sanitizeLegacyText(snapshot);
  const { percent, stateClass } = getProgressMeta(snapshot);
  const hasResult = Boolean(snapshot?.resultText);
  const hasHistory = Boolean(snapshot && (snapshot.phase !== "idle" || snapshot.finishedAt));
  const showResult = Boolean(snapshot && !snapshot.running && hasResult);
  const shouldCollapseCompletedState =
    !didInitialRender && Boolean(snapshot) && !snapshot.running && snapshot.phase === "done";

  if (!snapshot) {
    renderProgressState("Idle", "No test has been started yet.", 0, "");
    resultOutput.value = "";
    launchButton.textContent = "Start Test";
    launchButton.disabled = false;
    copyButton.textContent = DEFAULT_COPY_BUTTON_TEXT;
    copyButton.disabled = true;
    didInitialRender = true;
    return;
  }

  const running = Boolean(snapshot.running);
  resultOutput.value = shouldCollapseCompletedState ? "" : snapshot.resultText || "";
  launchButton.textContent =
    shouldCollapseCompletedState ? "Start Test" : hasHistory ? "Run Again" : "Start Test";
  launchButton.disabled = running;
  copyButton.disabled = shouldCollapseCompletedState || !hasResult;

  if (showResult && !shouldCollapseCompletedState) {
    showResultView();
  } else {
    renderProgressState(
      shouldCollapseCompletedState ? "Idle" : snapshot.message || (running ? "Running" : "Idle"),
      shouldCollapseCompletedState
        ? "No test has been started yet."
        : snapshot.detail || "No test has been started yet.",
      shouldCollapseCompletedState ? 0 : percent,
      shouldCollapseCompletedState ? "" : stateClass
    );
  }

  if (!copyButtonTimer) {
    copyButton.textContent = DEFAULT_COPY_BUTTON_TEXT;
  }

  didInitialRender = true;
}

async function copyTextToClipboard(text) {
  if (!text) {
    throw new Error("No result is available yet.");
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {}
  }

  const buffer = document.createElement("textarea");
  buffer.value = text;
  buffer.setAttribute("readonly", "");
  buffer.style.position = "fixed";
  buffer.style.top = "-10000px";
  buffer.style.left = "-10000px";
  buffer.style.opacity = "0";
  document.body.append(buffer);
  buffer.focus();
  buffer.select();
  buffer.setSelectionRange(0, buffer.value.length);

  const ok = document.execCommand("copy");
  buffer.remove();

  if (!ok) {
    throw new Error("Failed to copy the result.");
  }
}

function flashCopyButton(label) {
  if (copyButtonTimer) {
    clearTimeout(copyButtonTimer);
  }

  copyButton.textContent = label;
  copyButtonTimer = window.setTimeout(() => {
    copyButton.textContent = DEFAULT_COPY_BUTTON_TEXT;
    copyButtonTimer = null;
  }, 1400);
}

async function boot() {
  const snapshot = await readState().catch(() => null);
  renderState(snapshot);

  storageListener = (changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }
    renderState(changes[STORAGE_KEY].newValue || null);
  };

  chrome.storage.onChanged.addListener(storageListener);
}

launchButton.addEventListener("click", async () => {
  launchButton.disabled = true;
  copyButton.disabled = true;
  resultOutput.value = "";
  if (copyButtonTimer) {
    clearTimeout(copyButtonTimer);
    copyButtonTimer = null;
  }
  copyButton.textContent = DEFAULT_COPY_BUTTON_TEXT;
  renderProgressState(
    "Starting",
    "Preparing a new test run.",
    0,
    ""
  );

  try {
    const response = await sendMessage({ type: "START_TEST" });
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to start the background workflow.");
    }

    if (response.started) {
      renderProgressState(
        "Running",
        "The task has started. Keep this popup focused if you want to watch live progress here.",
        0,
        ""
      );
      return;
    }

    renderProgressState(
      "Running",
      "A test is already running in the background. Wait for it to finish.",
      0,
      "is-running"
    );
  } catch (error) {
    renderProgressState(
      "Start Failed",
      error instanceof Error ? error.message : String(error),
      0,
      "is-error"
    );
    launchButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  const text = resultOutput.value.trim();
  if (!text) {
    copyButton.disabled = true;
    return;
  }

  try {
    await copyTextToClipboard(text);
    flashCopyButton("Copied");
  } catch (_) {
    flashCopyButton("Copy Failed");
  }
});

window.addEventListener("unload", () => {
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
  }
});

void boot();
