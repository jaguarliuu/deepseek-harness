---
description: "智维小 C 的内网分发清单、现有源配置与待完成的部署能力。"
kind: "reference"
---

# 内网部署清单

[English](intranet.md) | 中文

## Summary

目标是员工首次使用不下载依赖，业务请求只访问公司提供的模型和服务。本清单核查当前源码与开发版能力目录；配置模板未应用到本机，也不代表已经产出或验收离线安装包。设置 → 内网源现已支持 npm 和 Python 默认源；模型源和详情源尚未纳入该页面。

## Table of Contents

- [分发清单](#分发清单)
- [已有配置位置](#已有配置位置)
- [尚未覆盖的外网访问](#尚未覆盖的外网访问)
- [交付与验收](#交付与验收)

## 分发清单

| 能力 | 当前依赖与行为 | 内网分发选择 |
| --- | --- | --- |
| 桌面核心、模型配置、能力中心、Skills 展示 | Electron、Node 执行环境、pnpm 与应用代码 | 随安装包；模型推理仍要配置内网服务 |
| Office 与五项新增办公 Skills | 内置 Python、14 个锁定 Python 分发包、Skills 文件；LibreOffice Kit 与平台引擎 | 桌面打包流程完整预置；各目标平台引擎与中文字体需实机验收 |
| 语音输入 | npm 的 sherpa-onnx-node 原生依赖，以及独立模型文件 | 首版暂不接入、不默认启用，不打包本地模型（INT8 组合约 241 MB）；后续按需对接公司内网 ASR |
| 智能体团队、自动授权审查、随对话更新的标题 | 应用插件代码，加模型调用 | 代码预置；模型请求走内网，预置代码不等于无服务运行 |
| DSH 徽章技能、开发者工具 | 本地插件代码与资源 | 可以预置；是否开放给员工另行决定 |
| Git 工作树 | 插件代码与可用的 Git 可执行程序 | 预置插件，部署目标机 Git；远程仓库使用内网地址 |
| 思考过程机器翻译、个性化推荐 | 插件代码，加所选服务或模型请求 | 代码可预置；核对实际服务地址后启用 |
| 自定义插件索引 | 索引服务与其引用的包、图片、详情 | 内网托管完整索引及资源；目前内部能力中心尚未接入远端公司目录 |
| Computer Use | 本机原生组件、操作系统权限、模型推理 | 可以预置匹配平台组件；当前目录标注仅支持 macOS，不能当作 Windows 已支持 |
| Claude Code、Codex 子智能体 | 当前目录为可添加包，各自 CLI/SDK/平台载荷和认证设置 | 可研究预装完整依赖，但不列入首版默认办公包；认证及服务兼容性需单独验收 |
| 浏览器与外部 MCP 扩展 | 取决于具体提供者，可配置已有浏览器路径或远端端点 | 不假定所有浏览器扩展都随 Electron 就绪；逐项锁定 MCP 服务和浏览器载荷 |

Python 锁定分发包为 numpy、pandas、python-dateutil、six、tzdata、python-docx、python-pptx、openpyxl、Pillow、lxml、XlsxWriter、typing_extensions、et_xmlfile、pypdf。版本及各平台 wheel 以 [runtime lock](../../../scripts/primary-runtime/lock.json) 为准；它们在构建阶段下载并组装，员工端不需要为了这些基础库再执行 pip。额外脚本依赖仍需按最终开放的 Skills 清单检查，个人电脑现有的 44 个 Skills 不等于所有员工安装后的固定清单。

## 已有配置位置

| 配置 | 现有位置 | 本目录模板 |
| --- | --- | --- |
| 单次插件安装源 | 能力中心 → 插件管理 → 添加插件 → 注册表 → 自定义地址 | [npmrc.example](npmrc.example) 用于管理员部署默认源 |
| 默认 npm 源与回退源 | profile 用户层 cordis.patch.yml 的 plugin-manager 配置 | [plugin-sources.patch.example.yml](plugin-sources.patch.example.yml) |
| 公共 npm 源速度探测 | ui-plugin-manager 的 registryProbeEnabled | 同上，设为 false |
| 语音模型内网镜像 | speech-to-text-sensevoice 的 modelOrigin 和 modelOrigins | [voice-mirror.patch.example.yml](voice-mirror.patch.example.yml) |
| 语音离线文件 | speech-to-text-sensevoice 的 modelDirectory 和 vadModelPath | [voice-local.patch.example.yml](voice-local.patch.example.yml) |
| 额外 Python 库 | 安装进程读取的 pip 配置文件 / PIP_CONFIG_FILE | [pip.conf.example](pip.conf.example) |

模板中的 company.invalid 是不可用的占位地址，不能直接用于发布。管理员替换地址并合并到目标 profile；不要覆盖现有用户配置。Cordis patch 会替换目标行的整个 config，需要保留已有自定义字段。语音两个模板仅作本地识别方案参考，不用于首版部署，也不是内网 ASR 接口配置。pip 模板不会自动写入应用环境；随包基础 Python 载荷由构建锁文件管理，并不读取这个模板。

语音镜像必须保留 [模型清单](../../../packages/experimental/speech-to-text-sensevoice/runtime/assets.json) 的 URL 路径、文件长度和 SHA-256；modelOrigin 只接受源站，不支持任意路径前缀。指定 modelOrigin 后不自动回退公网。指定本地模型路径时不自动下载，部署流程自行校验文件哈希。配置内网 registry 时同时清空 fallbackRegistries，否则可能仍有公共回退；还要检查 .npmrc 的 scoped registry 和锁文件中的绝对 tarball 地址。

## 尚未覆盖的外网访问

未安装插件的详情目前使用固定公共 CDN（jsDelivr、unpkg、npmmirror），不是 npm registry 地址，现有配置不能填写任意内网详情源。已安装插件的说明从本地包读取；详情中的远端图片仍应检查并预置。插件安装页面也有公共源候选，禁用自动探测并不禁止用户主动选择公网。

设置 → 内网源的 npm 卡片将源地址与清空备用源作为一次写入保存。Python 卡片将 PIP_INDEX_URL 写入新启动本地进程和终端的默认环境；显式进程环境与 pip 参数优先。两项都持久化在 profile patch，分别保存并显示失败。它不替代远端 SSH 配置、系统全局配置、pip 附加索引或公共详情 CDN 策略。模型源与连接测试未包含在本版页面中。

应用更新、Web 搜索、远程 MCP、模型服务、第三方 Skill 脚本和 npm 安装脚本可能有独立网络请求；安装包预置和 registry 配置不能覆盖这些请求。构建机可以提前获取依赖，终端只使用已分发的产物。内网镜像必须真实保存文件，不能只把请求重定向到公网。

## 交付与验收

推荐首版包预置核心应用、办公 Skills、全部基础 Python 库、匹配平台的 LibreOffice 引擎，不包含本地语音模型；语音功能暂缓，后续对接内网 ASR。可选能力与后续升级放入公司 npm / 模型资源服务；Python 源仅为以后新增依赖准备。模型配置预置公司推理服务地址，凭据另行部署。

发布前在没有开发缓存、没有系统 Node/Python 的目标机断开公网，验证首次启动、Word/Excel/PPT 生成、PDF 转换、中文字体；检查是否发起外网请求。再连接测试内网源，验证安装、更新、源不可达、文件缺失和哈希不匹配时的表现。macOS arm64 随包 Python 已在禁止网络、清空 PATH 的条件下通过文档读写，以及 PDF 文本提取、合并和页面选择验证。组装后的应用也已在禁止外网、仅允许本机通信的环境中通过首次启动、离线插件安装、办公 Skills 加载和 DOCX/XLSX/PPTX 转 PDF 验证。当前产物为未公证的本机测试 DMG；Windows、中文字体保真度和真实公司内网地址仍需目标机验收。

## Dev Note

安装源行为见 [plugin-manager](../../../packages/boot/plugin-manager/README.md)，运行时分发见 [Desktop](../README.md)，语音资源读取见 [runtime.ts](../../../packages/experimental/speech-to-text-sensevoice/src/runtime.ts)。设置页使用 Host 持久化配置，本地进程环境默认值由 subprocess-local 拥有。
