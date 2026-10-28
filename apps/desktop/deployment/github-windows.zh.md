# GitHub Windows 办公测试包

[English](github-windows.md) | 中文

`zhiwei-windows-office.yml` 工作流使用 GitHub 托管的 `windows-2022` 节点构建未签名 Windows x64 办公安装包，不需要自建 Runner 或签名证书。工作流配置在本地检查；实际打包和安装仍需在 Windows 流水线和目标电脑验证。

## 构建与下载

1. 打开仓库 Actions 页面，选择「智维小 C · Windows 办公离线测试包」。
2. 点击 Run workflow，选择 `master` 并启动。本工作流仅手动触发。
3. 成功后，从本次运行的 Artifacts 区域下载 `zhiwei-xiao-c-windows-x64-<运行编号>`。解压后得到 EXE、SHA-256 校验文件和 `office-runtime.json`。产物保留 14 天。

工作流安装 Node.js 24、仓库锁定的 pnpm 和 Python 3.12，复用 `cnb-windows-package.ps1` 的 Build 模式，安装锁定依赖并运行带包内运行时检查的 `package:win:x64:unsigned`。该模式不使用 CNB 凭据，也不上传到 CNB。GitHub 托管 Windows 提供原生构建工具；此未签名工作流不需要额外的仓库密钥。

## 离线内容与验收

安装包包含 Word、Excel、PPT、PDF Skills，打包的 Python 解释器和锁定库，以及 Windows 办公引擎，不包含本地 ASR 模型。员工电脑仍需访问其配置的内网模型地址；构建节点需要联网下载依赖。

在目标 Windows 电脑核对校验值、安装 EXE、配置内网模型，再测试创建和读取办公文件及导出 PDF。上传成功不代表已完成安装或内网验收。工作流不会发布 Release 或自动更新。

托管工具链见 [GitHub Windows 节点清单](https://github.com/actions/runner-images/blob/main/images/windows/Windows2022-Readme.md)；独立的自托管流水线见 [CNB 指南](cnb-windows.zh.md)。
