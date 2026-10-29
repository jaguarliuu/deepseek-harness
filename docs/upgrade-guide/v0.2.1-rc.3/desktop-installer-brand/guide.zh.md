---
kind: upgrade-guide
description: "桌面安装包文件名使用 zhiwei-xiaoc 前缀，替代 deepseek-harness。"
---

# 桌面安装包文件名

[English](guide.md) | 中文

## 变更

桌面安装包及其 blockmap 使用 `zhiwei-xiaoc-<version>-<os>-<arch>`，替代 `deepseek-harness-<version>-<os>-<arch>`。这会影响按文件名查找或分发安装包的脚本。版本字段、扩展名和未签名构建后缀保持原有格式。

## 迁移

1. 将仓库外维护的安装包文件名过滤规则和下载链接中的 `deepseek-harness-` 替换为 `zhiwei-xiaoc-`。
2. 使用更新后的代码构建，确认安装包、校验和及更新源路径使用新前缀。仓库中的打包和发布脚本已使用新前缀。
