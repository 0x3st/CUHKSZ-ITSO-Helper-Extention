# CUHK-Shenzhen Speed Test Helper

A locally loaded Chrome extension that automates the following flow:

1. Visit `https://nt-r.cuhk.edu.cn/`
2. Verify that the actual resolved server IP is `10.10.10.10`
3. Scrape the network report fields from the home page
4. Open `https://nt-r.cuhk.edu.cn/speedtest`
5. Click `Start` automatically
6. Wait for the test to finish, format the result, and copy it to the clipboard
7. Show a system notification when the test is done

## Files

- `manifest.json`: extension manifest
- `popup.html`: extension popup used to start the workflow
- `background.js`: background workflow for verification, offscreen orchestration, copy, and notifications
- `offscreen.html`: offscreen document that hosts the hidden iframe and clipboard helper
- `site-runner.js`: content script injected into the target iframe to scrape the report and run the speed test

## Install

1. Open Chrome
2. Go to `chrome://extensions`
3. Enable Developer Mode
4. Click "Load unpacked"
5. Choose `/Users/laywoo/research/speedtest-ext`

## Usage

1. Click the extension icon
2. Click `Start Test`
3. The extension runs inside an offscreen document with a hidden iframe
4. No visible site tab should be opened during the workflow
5. The result is copied to the clipboard and a system notification is shown

## Notes

A browser extension cannot perform a native ICMP `ping`. This implementation uses two browser-compatible checks instead:

- Access `nt-r.cuhk.edu.cn`
- Read the actual server IP used by the browser request and verify that it is `10.10.10.10`

This is closer to the browser's real network path than a plain DNS text lookup.

The current implementation uses a Chrome MV3 offscreen document instead of a background tab. As long as the target site can be embedded in an iframe, the whole workflow can run without opening a visible page.
