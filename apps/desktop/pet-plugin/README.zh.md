---
kind: reference
---

# 小 C pet 集成

[English](README.md) | 中文

[`vendor/dsh-pet/`](../../../vendor/dsh-pet/) 是 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的源码快照，`upstream.json` 固定到 `0e6465f29bb89b386390ba0f14fb86fa1bc656d0`，保留 MIT 许可证。快照包含宿主和共享源码、Electron 辅助程序及默认配置；不包含上游视频、独立启动器、下载的运行时或 npm 依赖。它不是 workspace 包。文件末尾换行经过统一；固定的第三方快照不参加第一方代码 lint，构建适配及安装包消费者仍执行原有检查。

[build.mjs](../pet-packs/xiaoc-sprite/build.mjs) 从原始快照应用本地适配：小 C 精灵图槽、方向行走不镜像、菜单位置稳定、工作状态恢复与取消、审批等待、工作时禁止入睡、角色人设及说话动作。桌面默认关闭语音、模型自动碎碎念（含梦话）、余额查询和生成配图。设置保存在 `$DSH_HOME/zhiwei-xiaoc-pet`。运行时下载器明确报错，辅助程序复用应用的 Electron 和固定的打包入口标记。Cordis 卸载等待辅助进程退出。宿主产物打入模型辅助代码及 Zod，可选语音后端保持关闭。

桌面构建将插件放到 `apps/desktop/.desktop-build/pet`。`artifact.json` 记录每个随包文件的 SHA256；构建检查必要脚本和所有图集，打包钩子验证复制后的 `resources/pet`。相对路径 overlay 支持安装位置变化。插件经 Desktop profile 加载，辅助进程随 Host 结束。已安装可执行文件仅将 `--zhiwei-pet-helper` 分流到固定的内置入口，不执行调用方提供的脚本。快捷任务和划词交办仍由桌面壳负责。

升级快照时，从审查后的上游提交复制同样的路径，保留 LICENSE，更新 `upstream.json`，复核 `build.mjs` 的每项替换，重新构建桌面端，并运行精灵图、移动、工作状态、文件清单、打包入口和打包钩子测试。快照不包含生成产物或运行时依赖下载。
