<p align="center">
  <img src="assets/mantis.png" width="200" alt="Mantis：一只戴着拳击手套的彩虹螳螂虾">
</p>

<h1 align="center">Mantis</h1>

<p align="center">
  <em>螳螂虾能看到 12 种颜色通道。你能看到 3 种。你的编程智能体一种也看不到。</em>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md">Tiếng Việt</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://github.com/vulinh1704/mantis/releases/download/v0.3.0/mantis-intro.mp4"><img src="assets/intro-thumb.jpg" width="880" alt="60 秒了解 Mantis：智能体声称修好了布局，其实只是把菜单按钮藏了起来，Mantis 抓住了这个掩盖"></a>
  <br><sub>▶ <a href="https://github.com/vulinh1704/mantis/releases/download/v0.3.0/mantis-intro.mp4">观看 60 秒介绍视频</a>（英文，带字幕）</sub>
</p>

> 这是精简版翻译。完整、最新的说明请看 [README.md](README.md)（英文）。

---

编程智能体（coding agent）写界面时是“闭着眼睛”的：它写好 CSS，说一句 **“完成 ✅”**，却从来没有打开过浏览器。

然后有人用手机打开页面：
- 菜单超出了屏幕；
- 深色模式下还有一张白色卡片，上面是白色文字；
- 越南语按钮文字被截掉了一半。

**Mantis 能抓到智能体看不到的界面问题，也能抓到它偷偷藏起来的问题。** Mantis 会：
1. 打开真实运行的应用；
2. 检查每种屏幕尺寸、两种主题和你支持的每种语言；
3. 用红框标出出问题的地方；
4. 从根源修复，并在“修复”只是把问题藏起来时发出警告；
5. 用修复前后的截图证明结果。

<p align="center">
  <img src="assets/contact-sheet.png" width="880" alt="Mantis 总览图：每个页面在手机、平板和桌面上，浅色和深色模式下的截图，问题用红框标出">
</p>

## 能发现什么

| 问题 | 你会看到 | 智能体为什么会漏掉 |
|---|---|---|
| 页面溢出 | 手机上页面可以左右滚动 | 它脑子里想的是桌面布局 |
| 文字被截断 | “Đăng ký nhận bản ti…” | 它只用简短的英文字符串测试 |
| 从右到左（RTL）错误 | 阿拉伯语按从左到右排版，一行内容在左边被截断 | 它从没给页面加 `dir="rtl"` |
| 元素重叠 | 一个徽标压在按钮上 | 绝对定位只在某个宽度下看起来正常 |
| 对比度不足 | 几乎看不清的灰色文字 | 颜色是在代码里选的，从没被真正看过 |
| 深色模式漏色 | 深色页面里有一张白色卡片 | 写死的 `#fff`，主题管不到 |
| 触控目标太小 | 手机上 16px 的图标按钮 | 鼠标很精确，手指不是 |
| 控制台错误、图片损坏 | 红色报错、空白方框 | 没人打开 DevTools |
| 布局跳动（layout shift） | 阅读时内容突然跳动 | 在 localhost 上一切都瞬间加载 |
| 偏离设计规范 | 和品牌色差一点的蓝色、一堆 16px 圆角里的一个 15px | 它写死了数值，而不是用你的设计 token |

## 工作方式

1. **看。** `/mantis` 在真实浏览器里把应用跑遍每种屏幕 × 主题 × 语言，生成带标注截图的报告，供智能体阅读。
2. **修。** `/mantis-fix` 修原因，不修表象。它绝不会在 body 上加 `overflow-x: hidden`、把文字缩小到放得下，或者关掉深色模式。下一次运行会检查它确实没这么做。
3. **证明。** `/mantis-proof` 为你的 pull request 生成修复前后的对比图、某个已修复问题的特写，还可以选择生成视频。

```bash
mantis look http://localhost:3000 --routes /,/settings --locales en,vi
```

**多语言（v0.5 起）：**
- 应用通过 URL、cookie 或 localStorage 切换语言时，使用 `--locale-strategy path:/{locale}`、`query:lang`、`cookie:NEXT_LOCALE` 或 `storage:i18nextLng`。
- 还没有翻译时，使用 `--locales en,pseudo`。所有文字会变长约 40%、加上重音符号并用方括号括起来（`[Šûƀƀšççŕîîƀéé]`），翻译后哪里会坏一眼就能看出。
- 阿拉伯语、希伯来语等：Mantis 也会检查从右到左的页面，并在页面忘记设置 `dir="rtl"` 时报错。`--locales en,pseudo-rtl` 可以在还没有这些语言的应用上测试 RTL 布局。

## 真的修好了，还是只是藏起来了？

如果你让智能体“把报告弄干净”，它可以什么都不修就让报告变干净。每次 `mantis look` 都会和同一 URL 的上一次运行做比较，所以下面这些招数都行不通：

| 招数 | Mantis 的报告 |
|---|---|
| 在 `html`、`body` 或应用根元素上加 `overflow-x: hidden` | 仍然报告溢出：指出被截断的元素和把它藏起来的那条规则 |
| 把出问题的元素藏起来（`display: none`、`visibility: hidden`、`opacity: 0`） | `cover-up`：问题没了，但元素也没了 |
| 把重叠的*另一个*元素藏起来 | 在那个元素上报告 `cover-up` |
| 把文字缩小到放得下 | `cover-up`：16px → 7px |
| 裁掉一部分，或把文字截短 | `cover-up`：可见部分变少，或字符变少 |
| 某个按钮、链接或标题悄悄消失了 | `lost` 警告 |

cover-up 属于错误，所以这次运行仍然失败。修复是真的时，运行会以一张“回执”结束：

```
Mantis: 0 errors, 0 warnings in 24 cells
  vs 2026-10-29T11-51-22: 18 fixed · 0 new · 0 cover-ups · 0 lost
```

## 数据

- **预埋的问题：** `fixtures/buggy-app` 里有 13 个界面问题。Mantis 全部报出，位置正好在预埋它们的屏幕、主题和语言组合里，没有多报。在修好的版本（`clean-app`）上报告为 0。两项检查都在 CI 中运行。
- **真实网站：** 在 10 个公开网站上，报告的 21 个错误中有 18 个经人工核实属实。3 个误报来自 tailwindcss.com 的演示框。
- **智能体基准测试：** 同一个智能体（Claude Code，Opus 5.5 和 Haiku 5.5）在有和没有 Mantis 的情况下完成同样的界面任务，由隐藏的 Playwright 评分器打分。所有内容，包括打平和输掉的结果，都在 [`bench/`](bench/) 里。
  - Mantis **没有**让 Opus 5.5 修好更多问题。
  - 在赶时间的提示下（“让 `check:ui` 通过，改动尽量小”），用了 Mantis 的智能体仍然把检查覆盖不到的问题告诉了用户：Atlas 5 个中报告 3.7 个，对比不用 Mantis 的 1.7 个；Excalidraw 每次都是 4/4，对比 0。
  - 在 72 次评分运行中，没有任何智能体掩盖问题。

## 安装

> Mantis 还处于早期开发阶段（v0.5）。难免有不完善的地方，遇到问题请[提交 issue](https://github.com/vulinh1704/mantis/issues)。

**Claude Code**

```
/plugin marketplace add vulinh1704/mantis
/plugin install mantis@mantis
```

**其他智能体**（Codex、Cursor、GitHub Copilot、Gemini CLI 等）：技能采用开放的 `SKILL.md` 格式：

```bash
npx skills add vulinh1704/mantis
```

**只用命令行工具**

```bash
npx -y @vulinh1704/mantis look http://localhost:3000
```

需要 Node.js 20 或更高版本。如果还没装浏览器，运行 `npx playwright install chromium`。不想装 Node 的话可以用 Docker 镜像 `ghcr.io/vulinh1704/mantis`（见 [README.md](README.md#install)）。

## 局限

- Mantis 检查的是页面能不能正常用，而不是好不好看。请搭配一个设计类技能一起使用。
- 目前还不会点击走完整个流程，也不检查悬停（hover）和焦点（focus）状态。
- 目前还不测量动画是否流畅。
- 要识别 cover-up，需要同一 URL 有上一次运行可供比较。
- 压在照片、CSS 背景图和渐变上的文字，目前还不检查对比度。

## 许可证

MIT © Truong Dang Vu Linh。基于 [Playwright](https://playwright.dev) 和 [axe-core](https://github.com/dequelabs/axe-core) 构建。
