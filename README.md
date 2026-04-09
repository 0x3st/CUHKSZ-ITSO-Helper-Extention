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

### From Release

1. Download the latest zip from the GitHub Releases page
2. Extract the zip to a local folder
3. Open Chrome and go to `chrome://extensions`
4. Enable Developer Mode
5. Click `Load unpacked`
6. Select the extracted folder that contains `manifest.json`

### From Source

1. Clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable Developer Mode
4. Click `Load unpacked`
5. Select the repository folder

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

---

# 中文说明

一个用于自动化港中深网络检测与测速流程的非官方 Chrome 扩展。

> 提示
> 本扩展仅适用于港中深校园网环境，或能够将 `nt-r.cuhk.edu.cn` 解析到 `10.10.10.10` 的港中深网络环境，例如官方校园 VPN。
>
> 这不是港中深或 ITSO 官方发布的产品。

## 功能说明

1. 访问 `https://nt-r.cuhk.edu.cn/`
2. 校验浏览器实际访问到的服务器 IP 是否为 `10.10.10.10`
3. 抓取主页中的网络报告字段
4. 打开 `https://nt-r.cuhk.edu.cn/speedtest`
5. 自动点击 `Start`
6. 等待测速完成
7. 将结果整理成便于阅读的类 TOML 文本
8. 直接在扩展弹窗中展示结果
9. 允许用户点击 `Copy Result` 手动复制结果

## 安装

### 通过 Release 安装

1. 从 GitHub Releases 页面下载最新 zip
2. 将 zip 解压到本地文件夹
3. 打开 Chrome，进入 `chrome://extensions`
4. 开启开发者模式
5. 点击 `Load unpacked`
6. 选择解压后的文件夹，该文件夹内应包含 `manifest.json`

### 通过源码安装

1. 克隆本仓库
2. 打开 Chrome，进入 `chrome://extensions`
3. 开启开发者模式
4. 点击 `Load unpacked`
5. 选择仓库目录

## 使用方法

1. 点击扩展图标
2. 点击 `Start Test`
3. 如果希望实时看到进度，请在测速期间保持弹窗打开
4. 等待结果出现在弹窗中
5. 如需复制结果，点击 `Copy Result`

## 文件说明

- `manifest.json`: 扩展清单与权限配置
- `popup.html`: 弹窗结构
- `popup.css`: 弹窗样式
- `popup.js`: 弹窗状态渲染与交互逻辑
- `background.js`: 主流程编排与状态持久化
- `offscreen.html`: 用于承载隐藏 iframe 的运行页
- `offscreen.js`: 隐藏运行页与后台之间的消息桥接
- `site-runner.js`: 负责抓取主页信息并执行测速自动化

## 说明

浏览器扩展无法执行原生 ICMP `ping`。本项目使用浏览器环境可行的方式来判断网络环境：

- 访问 `nt-r.cuhk.edu.cn`
- 读取浏览器这次请求实际连接到的服务器 IP
- 校验该 IP 是否为 `10.10.10.10`

这种方式比单纯做一次 DNS 文本查询更接近浏览器真实访问站点时的网络路径。

扩展会在隐藏文档中运行目标站点流程，因此正常情况下不会额外打开可见的网站标签页。

## 许可证

MIT。见 `LICENSE`。
