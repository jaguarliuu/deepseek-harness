---
kind: reference
---

# 小 C 精灵图试用

[English](README.md) | 中文

本角色包通过透明 PNG 图集提供待机、移动、互动和六档工作状态，在 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的桌面 Helper 中逐帧播放，上游固定为 `0e6465f29bb89b386390ba0f14fb86fa1bc656d0`，保留其 MIT 许可证。它复用上游的 A/B 播放、点击响应、拖拽和菜单。桌面安装包内置本集成；`prepare.mjs` 还可创建独立预览。

`pack.json` 管理帧时长、每个动作使用的图集和位置。右键 → 动作 → 互动 → 伸懒腰播放一次舒展动作，随后回到站立。同一菜单的「挠头思考」会让小 C 歪头、抬手挠安全帽，再回到待机。`sprite-media.js` 为小 C 实例提供画布播放槽，其他宠物仍使用视频槽。待机会循环呼吸、眨眼和轻微摆动；转身偶尔自动播放，也可在「动作 → 转向」中手动触发。转身包含侧面和背面姿态，再回到正面。精灵图播放槽禁用水平镜像，保留胸前字母方向。点击后仍招手一次。「动作 → 移动」提供「向左散步」和「向右散步」。两个方向使用各自的迈步帧，保留字母方向；上游移动驱动根据播放时间同步桌面窗口位移，保留屏幕边界检查，并在拖拽时停止。偶尔自主散步的概率由 `pack.json` 中的权重控制。右键菜单展开期间保持原地待机，菜单收起后恢复自主活动。本次试用关闭语音、余额查询和模型碎碎念。播放不需要视频生成或模型请求。

六档工作状态复用已有会话事件监听：回合开始进入思考，工具调用进入工作，工具返回进入整理，审批或提问进入等待，回合正常完成进入成功，失败进入出错。进行中状态循环，终态播放一次。工作会打断漫游；只更新任务文字时保留播放进度；重启后恢复活动状态，不重放旧的完成动作。无密钥事件回放和桌面消费者测试覆盖取消、多会话、并行工具和目标续跑。实际画面可通过上游 `/work-status` 状态接口逐档检查，此检查不调用模型。预览配置监听自身会话，与其他已运行配置相互独立。

先构建仓库产物，再准备固定版本的上游代码和覆盖配置：

```sh
pnpm run build:artifacts
node apps/desktop/pet-packs/xiaoc-sprite/prepare.mjs
node --test apps/desktop/pet-packs/xiaoc-sprite/sprite-media.test.mjs apps/desktop/pet-packs/xiaoc-sprite/movement.integration.test.mjs apps/desktop/pet-packs/xiaoc-sprite/work-status.integration.test.mjs
```

设置独立的 `DSH_HOME`，并在 `DSH_PET_ELECTRON_PATH` 中指定已有的 Electron 可执行文件，通过 dsh 配置启动：

```sh
pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch output/dsh-pet-sprite-lab/pet.overlay.yml --port 3090 --no-open
```

准备脚本将上游克隆到 `output/dsh-pet-sprite-lab/upstream`，保留许可证，只修改桌面渲染器和试用配置，并使用当前仓库的宿主包构建。它不会向员工配置安装或发布插件。浏览器浮层的精灵图播放不在本集成范围内。桌面构建通过 `build.mjs` 复制同一个适配后的插件，安装时不克隆或下载源码。

PNG 使用内置 imagegen 工具，以 `assets/brand/zhiwei-xiaoc/character-v1/reference.png` 为参考制作：透明 4×4 图集、十六个对齐的全身姿势、固定脚底和镜头、右臂抬起、招手两次、回到站立，保留安全帽球形标识和胸前 C。末尾复用第零帧，避免生成的首尾站姿不一致。

右键 → 睡觉依次播放打哈欠、坐下入睡和呼吸循环；点击机器人后伸展起身。鼠标悬停时按 Z 可切换睡醒，S 保留上游截图功能。任务进行时拒绝新的入睡请求并显示提示。睡眠期间停止自主移动，醒来后恢复当前工作状态。睡眠状态仅保存在进程内，重启辅助窗口会唤醒。三段动画共用坐姿衔接帧。

说话气泡随机搭配三段动作：摊手讲解、微笑点头、抬指分享。上游碎碎念和对话回复通道为每条消息选择一段，并避开当前动作。`anim: false` 的提示不改变动画，说话也不会打断睡眠。动作播放一次后恢复待机或当前工作状态。预览版保持自动碎碎念、语音和生成配图关闭，对话复用宿主模型与小 C 人设。
