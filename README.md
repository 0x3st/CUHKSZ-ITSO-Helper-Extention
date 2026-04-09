<p align="center">
  <img src="assets/cuhksz-logo.png" alt="CUHK-Shenzhen" width="520" />
</p>

# CUHKSZ ITSO Helper

An unofficial Chrome extension for automating the CUHK-Shenzhen network check and speed test workflow.

> Warning
> This extension is intended only for use on the CUHK-Shenzhen campus network, or a CUHK-Shenzhen network environment such as the official campus VPN that resolves `nt-r.cuhk.edu.cn` to `10.10.10.10`.
>
> This is not an official CUHK-Shenzhen or ITSO product.

## What It Does

1. Visit `https://nt-r.cuhk.edu.cn/`
2. Verify that the actual resolved server IP is `10.10.10.10`
3. Scrape the network report fields from the home page
4. Open `https://nt-r.cuhk.edu.cn/speedtest`
5. Click `Start` automatically
6. Wait for the speed test to finish
7. Format the result into a clean TOML-like block
8. Show the result directly in the extension popup
9. Let the user copy the result manually with `Copy Result`

## Install

1. Open Chrome
2. Go to `chrome://extensions`
3. Enable Developer Mode
4. Click `Load unpacked`
5. Choose this folder: `/Users/laywoo/research/speedtest-ext`

## Usage

1. Click the extension icon
2. Click `Start Test`
3. Keep the popup open while the test runs if you want to watch live progress
4. Wait for the result to appear in the popup
5. Click `Copy Result` if you want to place the formatted output on the clipboard

## Files

- `manifest.json`: extension manifest and permissions
- `popup.html`: popup layout
- `popup.css`: popup styling
- `popup.js`: popup state rendering and user actions
- `background.js`: workflow orchestration and state persistence
- `offscreen.html`: hidden runtime document used to host the target iframe
- `offscreen.js`: hidden document messaging bridge
- `site-runner.js`: page automation for scraping and speed test execution

## Notes

A browser extension cannot perform a native ICMP `ping`. This implementation uses browser-compatible checks instead:

- Access `nt-r.cuhk.edu.cn`
- Read the actual server IP used by the browser request
- Verify that it resolves to `10.10.10.10`

That is closer to the browser's real network path than a plain DNS text lookup.

The extension runs the site flow in a hidden document so it can automate the test without opening a visible site tab under normal conditions.

## License

MIT. See `LICENSE`.
