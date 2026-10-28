# CNB Windows 办公测试包

[English](cnb-windows.md) | 中文

CNB 支持组织自托管 Windows Runner。本流水线需要一台在线的 Windows x64 构建机，不能使用 CNB 默认的 Linux Docker 节点代替。当前配置只完成本地静态检查，尚未在 Windows Runner 上执行；不能将配置提交成功视为安装包已生成。

## 构建节点

根组织管理员在「组织设置 → 构建节点」中新增 Runner，添加 `windows`、`zhiwei-x64` 两个标签，在 Windows 机器上运行 CNB 提供的连接脚本。若没有构建节点入口，需要联系 CNB 开通。参考 [CNB 构建节点](https://docs.cnb.cool/zh/build/build-node.html)。

构建机需要 Git、PowerShell 7、Windows x64 Node.js 24.9 或更新版本、Python 3、tar，以及仓库 `package.json` 指定的 pnpm 版本。安装 Visual Studio 2022 Build Tools 的「使用 C++ 的桌面开发」工作负载（含 MSVC x64/x86 工具和 Windows SDK），并确保构建账号可创建符号链接。构建机需要联网获取 npm、Python、Electron 和办公运行时依赖及上传附件；公司测试电脑不需要这些构建工具。

## 手动构建

将配置提交到 CNB 的 `master` 后，在分支页面点击「构建 Windows 办公测试包」。事件 `web_trigger_windows_office` 调度到上述 Runner，依次执行安装依赖、现有 Windows 未签名打包命令、运行时检查及附件上传。没有在线节点时，不能生成安装包；不会自动退回 Linux。参考 [手动触发流水线](https://docs.cnb.cool/zh/build/web-trigger.html)。

打包命令保持 `package:win:x64:unsigned` 原有检查，包含包内运行时和办公转换检查，任何步骤失败都会停止后续上传。Word、Excel、PPT、PDF Skills、Python、锁定的 14 个 Python 库以及匹配 Windows 的办公引擎随包组装；完整版本见生成的 `office-runtime.json`。语音识别不启用，不下载本地 ASR 模型。模型服务仍需员工在设置里填写公司内网地址。

## 下载与内网测试

成功后在本次提交的附件中下载 `.exe`、`.exe.sha256` 和 `office-runtime.json`。附件上传使用固定版本的 CNB 官方附件插件，通过原生 Node.js 执行，不要求 Windows Runner 安装 Docker；使用流水线临时 `CNB_TOKEN`，不把访问令牌写入源码。上传目标为当前提交，不创建正式 Release，也不发布到自动更新服务。

此包未做 Windows 代码签名，适用于内部测试；如果公司终端策略不允许未签名安装包，需要使用公司的签名流程。进入内网后先验证安装、启动和私有模型连接，再分别创建、读取 Word、Excel、PPT、PDF 并测试导出 PDF。扫描 PDF 的 OCR 不属于这套基础依赖。

构建机本地产物位于 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/`。若上传失败但打包成功，可从该目录取包；日志包含安装包名称与 SHA-256。Windows 实际安装和内网验收必须在目标电脑执行。
