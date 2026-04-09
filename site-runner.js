(() => {
  const marker = location.hash || "";
  if (!marker.startsWith("#cuhksz-ext-")) {
    return;
  }

  const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
  const page = location.pathname.startsWith("/speedtest") ? "speedtest" : "report";
  let reportStarted = false;
  let speedtestStarted = false;

  function sendToParent(type, payload = {}) {
    window.parent.postMessage(
      {
        source: "cuhksz-site-runner",
        type,
        page,
        ...payload
      },
      extensionOrigin
    );
  }

  function waitFor(predicate, timeoutMs, errorMessage, intervalMs = 250) {
    return new Promise((resolve, reject) => {
      if (predicate()) {
        resolve();
        return;
      }

      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (predicate()) {
          clearInterval(timer);
          resolve();
          return;
        }

        if (Date.now() - startedAt < timeoutMs) {
          return;
        }

        clearInterval(timer);
        reject(new Error(errorMessage));
      }, intervalMs);
    });
  }

  async function scrapeReport(timeoutMs) {
    const clean = (value) => value.replace(/\s+/g, " ").trim();
    const readAll = (selector) =>
      Array.from(document.querySelectorAll(selector))
        .map((node) => clean(node.textContent || ""))
        .filter(Boolean);

    const matchLine = (lines, pattern) => {
      const line = lines.find((item) => pattern.test(item));
      if (!line) {
        return "";
      }
      const match = line.match(pattern);
      return match?.[1] ? clean(match[1]) : "";
    };

    await waitFor(
      () =>
        ["#show_baidu", "#show_google", "#show_cuhk"].every((selector) =>
          Boolean(document.querySelector(selector)?.textContent.trim())
        ),
      timeoutMs,
      "Timed out while waiting for the home page ping values."
    );

    const basicLines = readAll("#basic p");
    const pingLines = readAll("#Ping p");
    const detailLines = readAll("#detail p");
    const titleText = clean(document.querySelector("h1")?.textContent || "");

    return {
      testId: titleText.match(/Test ID is\s+(.+)/i)?.[1]?.trim() || "",
      time: matchLine(basicLines, /^Time\s*:\s*(.+)$/i),
      networkType: matchLine(basicLines, /^Network TYPE\s*:\s*(.+)$/i),
      macAddress: matchLine(basicLines, /^MAC Address\s*:\s*(.*)$/i),
      location: matchLine(basicLines, /^Location\s*:\s*(.+)$/i),
      account: matchLine(basicLines, /^Account\s*:\s*(.+)$/i),
      ipv4: matchLine(pingLines, /^IPv4 address\s*:\s*(.+)$/i),
      ipv6: matchLine(pingLines, /^IPv6 address\s*:\s*(.+)$/i),
      pingBing: matchLine(pingLines, /^ping cn\.bing\.com\s*:\s*(.+)$/i),
      pingGoogle: matchLine(pingLines, /^ping www\.google\.com\.hk\s*:\s*(.+)$/i),
      pingCuhk: matchLine(pingLines, /^ping i\.cuhk\.edu\.cn\s*:\s*(.+)$/i),
      vpnGroup: matchLine(detailLines, /^VPN_Group\s*:\s*(.+)$/i),
      vpnPolicy: matchLine(detailLines, /^VPN_Policy\s*:\s*(.+)$/i)
    };
  }

  async function runSpeedtest(timeoutMs) {
    const byId = (id) => document.getElementById(id);
    const text = (id) => (byId(id)?.textContent || "").trim();
    const hasMetric = (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) && parsed > 0;
    };

    const startButton = byId("startStopBtn");
    if (!startButton) {
      throw new Error("Could not find the speed test button #startStopBtn.");
    }

    startButton.click();

    await waitFor(
      () => startButton.classList.contains("running"),
      5000,
      "The speed test did not start after clicking Start."
    );

    await waitFor(
      () =>
        !startButton.classList.contains("running") &&
        hasMetric(text("pingText")) &&
        hasMetric(text("jitText")) &&
        hasMetric(text("dlText")) &&
        hasMetric(text("ulText")),
      timeoutMs,
      "The speed test timed out before full results were returned."
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      ping: text("pingText"),
      jitter: text("jitText"),
      download: text("dlText"),
      upload: text("ulText"),
      campusIp: text("ip").replace(/^Campus IP Address:\s*/i, ""),
      resultTestId: text("testId"),
      resultUrl: byId("resultsURL")?.value?.trim() || ""
    };
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== extensionOrigin || event.source !== window.parent) {
      return;
    }

    const data = event.data;
    if (!data || data.source !== "cuhksz-offscreen") {
      return;
    }

    if (data.type === "SCRAPE_REPORT") {
      if (reportStarted) {
        return;
      }

      reportStarted = true;
      void scrapeReport(data.timeoutMs)
        .then((payload) => sendToParent("REPORT_READY", { payload }))
        .catch((error) =>
          sendToParent("STEP_ERROR", {
            stage: "Network report scrape",
            error: error instanceof Error ? error.message : String(error)
          })
        );
      return;
    }

    if (data.type === "RUN_SPEEDTEST") {
      if (speedtestStarted) {
        return;
      }

      speedtestStarted = true;
      void runSpeedtest(data.timeoutMs)
        .then((payload) => sendToParent("SPEEDTEST_READY", { payload }))
        .catch((error) =>
          sendToParent("STEP_ERROR", {
            stage: "Speed test run",
            error: error instanceof Error ? error.message : String(error)
          })
        );
    }
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    sendToParent("FRAME_READY");
  } else {
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        sendToParent("FRAME_READY");
      },
      { once: true }
    );
  }
})();
