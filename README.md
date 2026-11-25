<p align="center">
  <img src="assets/coreader-cr.png" alt="CoReader 图标" width="96" />
</p>

<h1 align="center">CoReader</h1>

<p align="center">面向英文论文的 Windows 与 macOS PDF 阅读器</p>

<p align="center">
  <a href="https://github.com/YuboCoco/CoReader/releases/latest">版本发布</a> ·
  <a href="#功能导览">功能导览</a> ·
  <a href="#开始使用">开始使用</a> ·
  <a href="#模型与账号">模型与账号</a> ·
  <a href="#从源码构建">源码构建</a>
</p>

CoReader 把论文库、双语对照、批注和模型助读放在一起。导入 PDF 即可搜索、标记和离线翻译。接入自己的模型账号后，还能围绕原文提问、分析整篇论文、整理参考文献并解释图表和公式。

[![CoReader 同时显示 PDF 原文、带插图的中文译文、论文分析和阅读助手](docs/screenshots/bilingual-reading.webp)](docs/screenshots/bilingual-reading.webp)

*CoReader 界面实拍。左侧原文与中间译文按段联动，右侧可同时查看论文分析和阅读助手。阅读示例为 Vaswani 等人在 NeurIPS 2017 发表的论文。[Attention Is All You Need](https://arxiv.org/abs/1706.03762)*

## 功能导览

### 论文库与阅读进度

支持拖放 PDF、导入单篇文章，也可递归导入整个文件夹。用多级分类与标签整理文献，编辑标题、作者、年份、出处、DOI 和摘要。可切换列表或表格，搜索标题、作者和标签，按阅读状态筛选，再从上次读到的位置继续。

[![论文库表格视图，左侧有分类和标签，右侧展示论文信息和阅读进度](docs/screenshots/library-table.webp)](docs/screenshots/library-table.webp)

### 双语阅读、划词与批注

- **原文与译文对照** 可翻译单段、本页、本章或全文；支持在「阅读设置」中开启**打开文章后自动执行对照翻译**。悬停段落会联动高亮原文和译文，译文侧保留从原文裁切的图、表与独立公式，并支持定位原文和重译此段。
- **划词与液态玻璃浮窗** 选中文字后弹出液态玻璃工具条，一键翻译、批注、高亮、解释术语或引用到阅读助手。翻译与批注浮窗均支持二次点击工具按钮快速收起，按住 `Shift` 可跨段追加选区一次翻译。
- **滑出目录与页面控制** 左下角可平滑呼出 PDF 文献目录，顶部控制条支持调整页面左右横向偏移、缩放比例与双栏切换。
- **本地翻译** Windows 和 macOS 安装包与便携包内置 Haidass-Translate-143M 与腾讯 Hy-MT2-1.8B，两款模型均可在 CPU 上离线运行。

[![PDF 划词工具条及原文与译文并排显示的翻译浮层](docs/screenshots/selection-translation.webp)](docs/screenshots/selection-translation.webp)

<details>
<summary>查看高亮与批注、术语解释</summary>

[![PDF 中的多色高亮、批注浮层及按页汇总的高亮与批注](docs/screenshots/annotation.webp)](docs/screenshots/annotation.webp)

[![Transformer 术语解释浮层与右侧术语卡片](docs/screenshots/terminology.webp)](docs/screenshots/terminology.webp)

</details>

### 阅读助手、论文分析与参考文献

- **围绕原文提问** 可总结本页、检索全文，或引用选中的原文。回答中的页码可点击跳回 PDF，对话按论文保存。
- **分析整篇论文** 生成涵盖研究问题、方法、实验和局限的报告。长文可分段处理后汇总。报告的信息按钮会显示生成模型、时间和分析范围。
- **整理参考文献** 提取书目信息与标题译文，优先使用原文提供的 DOI 或链接，并尝试补全缺失链接。没有找到时显示「未找到」。
- **解析图表与公式** 可从原文中的图、表或公式发起，也可以框选。生成结果保存在「内容解析」卡片中，图片解析需要支持图片输入的模型。

[![阅读助手的回答带有可跳回 PDF 原文的页码引用](docs/screenshots/reading-assistant.webp)](docs/screenshots/reading-assistant.webp)

<details>
<summary>查看论文分析、参考文献和图表解析</summary>

| 论文分析 | 参考文献 |
| --- | --- |
| <a href="docs/screenshots/paper-analysis.webp"><img src="docs/screenshots/paper-analysis.webp" alt="论文分析报告" width="360" /></a> | <a href="docs/screenshots/references.webp"><img src="docs/screenshots/references.webp" alt="参考文献、译名、书目链接与链接查找状态" width="360" /></a> |

[![PDF 原文中的 Transformer 架构图及右侧保存的图表解析](docs/screenshots/figure-analysis.webp)](docs/screenshots/figure-analysis.webp)

</details>

### 伴读卡片：相册与白噪音

阅读之余可在功能栏开启「相册」与「白噪音」伴读卡片，打造更专注舒适的桌面阅读环境：

- **相册卡片** 选择本地照片文件夹，支持弹窗内可视化预览并点选单张、多张或整夹轮播；可设置轮播时间间隔，展示照片时卡片顶栏会自动隐去以获得纯净视野。
- **白噪音卡片** 内置多场景分类的 84 首环境音轨（自然、雨声、动物、场所、器物、交通等），支持**多音轨同时混音播放**与独立音量调节、循环/随机混音模式，并支持加载本地自定义音频文件夹。

[![夜间深灰 PDF 配图相册卡片与多音轨白噪音混音卡片](docs/screenshots/album-ambient.webp)](docs/screenshots/album-ambient.webp)

### 可调整的阅读工作区

功能栏可停靠在**左侧、右侧或底部**（可在「显示设置」切换常驻左/右侧），右侧支持单列与双列。拖动卡片标题时附带对齐引导线与避让动效，拖入阅读区成为浮动卡片并自动展开，移回停靠栏恢复原先展开状态。可从功能栏顶部的「主题配色」快捷切换界面与页面配色、一键折叠/展开所有卡片，或保存最多 3 个自定义布局。

[![阅读区中围绕 PDF 自由摆放的浮动功能卡片](docs/screenshots/floating-cards.webp)](docs/screenshots/floating-cards.webp)

<details>
<summary>查看常驻左侧与目录滑出、右侧双列、底部停靠和全部折叠</summary>

[![功能栏常驻左侧，同时打开右上角滑出目录与快捷主题配色面板](docs/screenshots/dock-left-outline.webp)](docs/screenshots/dock-left-outline.webp)

[![功能栏停靠于 PDF 右侧并分两列显示](docs/screenshots/dock-two-columns.webp)](docs/screenshots/dock-two-columns.webp)

[![功能栏停靠于 PDF 下方](docs/screenshots/dock-bottom.webp)](docs/screenshots/dock-bottom.webp)

<a href="docs/screenshots/dock-collapsed.webp"><img src="docs/screenshots/dock-collapsed.webp" alt="右侧功能栏的八张卡片全部折叠" width="360" /></a>

</details>

### 界面主题、液态玻璃与深色 PDF 纸面

界面采用可自适应对比度的**液态玻璃（Liquid Glass）**材质（可在「显示设置」调节开关及浅/深色着色强度）。内置多款浅色、深色、双拼与动态流光主题（`晴光流彩`、`极夜流光`），并新增 **5 款深色 PDF 页面配色**（`玄夜深灰`、`深夜靛蓝`、`暖墨褐纸`、`墨绿夜读`、`极夜纯黑`），在夜间护眼反色阅读的同时保留彩图色相与高亮辨识度。

<details>
<summary>展开主题图集（含深色 PDF 纸面与流光主题）</summary>

| 山间松雾 · 纸张纹理 | 秋日麦穗 · 护眼黄 |
| --- | --- |
| [![山间松雾 · 纸张纹理](docs/screenshots/theme-light-green.webp)](docs/screenshots/theme-light-green.webp) | [![秋日麦穗 · 护眼黄](docs/screenshots/theme-light-amber.webp)](docs/screenshots/theme-light-amber.webp) |

| 蔷薇薄雾 · 细麻纹 | 玄灰夜幕 · 玄夜深灰 |
| --- | --- |
| [![蔷薇薄雾 · 细麻纹](docs/screenshots/theme-light-pink.webp)](docs/screenshots/theme-light-pink.webp) | [![玄灰夜幕 · 玄夜深灰](docs/screenshots/theme-dark-slate.webp)](docs/screenshots/theme-dark-slate.webp) |

| 深海子夜 · 深夜靛蓝 | 炉边夜话 · 暖墨褐纸 |
| --- | --- |
| [![深海子夜 · 深夜靛蓝](docs/screenshots/theme-dark-midnight.webp)](docs/screenshots/theme-dark-midnight.webp) | [![炉边夜话 · 暖墨褐纸](docs/screenshots/theme-dark-sepia.webp)](docs/screenshots/theme-dark-sepia.webp) |

| 极夜流光 · 极夜纯黑 | 深海子夜 · 纸张纹理 |
| --- | --- |
| [![极夜流光 · 极夜纯黑](docs/screenshots/theme-prism-dark.webp)](docs/screenshots/theme-prism-dark.webp) | [![深海子夜 · 纸张纹理](docs/screenshots/theme-dark-paper.webp)](docs/screenshots/theme-dark-paper.webp) |

| 深海子夜 · 柔白 | 炉边夜话 · 浅青绿 |
| --- | --- |
| [![深海子夜 · 柔白](docs/screenshots/theme-dark-ivory.webp)](docs/screenshots/theme-dark-ivory.webp) | [![炉边夜话 · 浅青绿](docs/screenshots/theme-dark-sage.webp)](docs/screenshots/theme-dark-sage.webp) |

| 白蓝 · 浅青绿 | 米绿 · 雾蓝 |
| --- | --- |
| [![白蓝 · 浅青绿](docs/screenshots/theme-duo-blue.webp)](docs/screenshots/theme-duo-blue.webp) | [![米绿 · 雾蓝](docs/screenshots/theme-duo-green.webp)](docs/screenshots/theme-duo-green.webp) |

</details>

## 开始使用

1. **安装或解压**。支持 Windows 10/11 x64。安装版运行下载的 EXE，便携版完整解压后双击 `CoReader.exe`。[下载安装版](https://github.com/YuboCoco/CoReader/releases/download/v0.1.4/CoReader-0.1.4-Setup-win-x64.exe) · [下载便携版](https://github.com/YuboCoco/CoReader/releases/download/v0.1.4/CoReader-0.1.4-win-x64.zip)
2. **打开论文**。首次启动内置示例论文《Attention Is All You Need》与交互式新手引导；也可在首页左侧点击「打开 PDF」或「从文件夹导入」。打开论文后，通过顶部控制条切换原文与对照，从左下角打开目录、文内搜索或设置。
3. **翻译或提问**。划词后点击翻译即可使用随包附带的离线模型。需要问答或解析时，从「设置 → 模型与账号」连接服务商，再设置问答模型。

版本号可在首页左下角或设置面板查看。应用启动时会在后台检查 GitHub 正式版本，发现新版本时会提示并提供发布页入口。

**macOS 13.3 及以上** 按处理器下载对应 ZIP，完整解压后打开 `CoReader.app`。支持 macOS 系统菜单、原生窗口按钮、拖动顶栏及 `⌘O` 打开 PDF。数据保存在 `~/Library/Application Support/English Lit Reader`。[下载 Apple Silicon 版](https://github.com/YuboCoco/CoReader/releases/download/v0.1.4/CoReader-0.1.4-mac-arm64.zip) · [下载 Intel 版](https://github.com/YuboCoco/CoReader/releases/download/v0.1.4/CoReader-0.1.4-mac-x64.zip)

GitHub 上的 macOS ZIP 使用临时签名。Mac 实机运行与 Apple 公证仍待完成。

## 模型与账号

设置窗口以 3D 卡片环直观呈现各模型服务商的连接状态与余额/配额快照，支持多账号与本地离线模型按任务分流。

[![模型设置 3D 服务商卡片环与任务模型配置](docs/screenshots/model-ring.webp)](docs/screenshots/model-ring.webp)

| 接入方式 | 操作 |
| --- | --- |
| **ChatGPT 订阅** | 在 ChatGPT 卡片中发起连接，在系统浏览器完成授权。可用模型取决于账号权限。 |
| **DeepSeek、GLM** | 在对应卡片中填写平台 API Key，验证后保存。DeepSeek 支持查询 API 余额。 |
| **Claude** | 从连接设置打开 Claude Console 获取 API Key，再回到 CoReader 验证。请求后可查看服务返回的限流余量。 |
| **Kimi** | 在 Kimi 卡片中切换接入方式。「Kimi API」可配置开放平台 API Key 和查看余额。「Kimi Code」需安装新版 [Kimi Code CLI](https://www.kimi.com/code/docs/kimi-code-cli/guides/getting-started)，然后在浏览器授权。 |
| **火山方舟** | 填写火山方舟 API Key 读取豆包模型目录，或填写已开通的 Model ID 或推理接入点 ID 并验证。 |
| **WorkBuddy** | 登录 [CodeBuddy CLI](https://www.codebuddy.cn/docs/cli/quickstart)，在 WorkBuddy 卡片中点击「检测 CodeBuddy CLI 账号」。 |
| **自定义 API** | 输入 OpenAI 兼容的 Base URL 和可选 API Key。可自动读取模型目录，也可填写模型 ID 并发送短请求验证。支持 HTTPS 和本机回环 HTTP。 |
| **离线翻译** | 从「任务模型 → 翻译」选择内置模型，无需账号。 |

问答和翻译可分别选模型。在线模型列表根据已连接账号更新，推理强度按模型支持情况显示。配置完成后可用「测试问答模型」验证连接。

## 离线使用与本地数据

- **离线可用** 打开和组织论文、搜索 PDF 文本、添加高亮和批注、运行内置翻译，以及查看已保存的译文和研究记录。扫描版可查看原始页面，划词和文内搜索需要 PDF 自带文字层。
- **联网功能** 使用云模型时，任务所需的选区、正文或裁切图片会发送至已选服务。参考文献补链可使用公开书目服务。版本检查访问 GitHub。
- **备份与卸载** Windows 默认数据目录为 `%APPDATA%\English Lit Reader`，论文 PDF 存在其中的 `papers/`，库记录保存在 `library.sqlite`。备份前先关闭应用，再复制整个数据目录。可在 Windows「已安装的应用」或开始菜单卸载，卸载会保留个人阅读数据。

## 从源码构建

使用 **Node.js 24**。从源码启动时可先验证阅读界面，再下载离线运行所需的模型资源。

```powershell
git clone https://github.com/YuboCoco/CoReader.git
cd CoReader
npm ci
npm run dev
```

### Windows x64

```powershell
npm run prepare:translation:win
npm run prepare:layout:win
npm test
npm run package:win
```

打包产物默认写入 `release/`，同时生成 `CoReader-latest/` 供直接运行。安装 **Inno Setup 6.7+** 后，运行 `npm run installer:win` 生成 Windows 安装程序。若 `ISCC.exe` 不在 PATH 中，将 `COREADER_ISCC` 指向编译器路径。可用 `COREADER_INNO_ZH` 指定简体中文 `.isl` 文件。打包后可用 `node scripts/smoke-win.mjs` 运行桌面集成测试。

### macOS

在 macOS 上运行以下命令。默认构建当前机器的架构，指定另一架构时，向准备翻译资源和打包两个命令传入相同的 `arm64` 或 `x64`。

```sh
npm run prepare:translation:mac
npm run prepare:layout:mac
npm test
npm run package:mac
```

构建生成 `.app`、便携 ZIP 和 DMG。可在对应架构的 Mac 上运行 `node scripts/smoke-mac.mjs release/CoReader-darwin-$(node -p process.arch)/CoReader.app` 验证 PDF、原生窗口和离线引擎。默认构建使用临时签名，面向公众的免提示分发需要 Apple Developer ID 签名和公证。

CoReader 使用 Electron、React、Vite、PDF.js 和 SQLite。离线翻译由本地 llama.cpp 运行时执行，PDF 版面识别使用 ONNX Runtime。

| 目录 | 内容 |
| --- | --- |
| `src/renderer/` | 论文库、PDF 阅读、翻译对照、功能卡片和设置 |
| `src/` | Electron 主进程、Preload、文献存储、模型接入与分析逻辑 |
| `scripts/` | 模型准备、Windows 打包和桌面验证 |
| `test/` | 解析、存储、模型适配等逻辑测试 |

## 致谢与许可

源码使用 [MIT 许可证](LICENSE)。界面字体采用小米 MiSans。源码构建默认可使用系统字体，放入 `assets/fonts/MiSansVF.ttf` 后可随包嵌入 MiSans。[MiSans 官方下载与许可](https://hyperos.mi.com/font/en/download/)

离线模型资源见 [Haidass-Translate-143M GGUF](https://huggingface.co/umeiko/Haidass-Translate-143M-GGUF)、[Hy-MT2-1.8B GGUF](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF) 和 [版面模型许可](assets/layout-licenses)。
