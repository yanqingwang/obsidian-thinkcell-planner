# ThinkCell Planner for Obsidian

[English](#english) | [中文](#中文)

---

## English

Create **Think-Cell style project plans and Gantt charts** directly in Obsidian. Renders in **16:9 PowerPoint size (1280×720)** and exports **standard SVG** that can be converted to editable shapes in PowerPoint.

### Why SVG for PowerPoint?

Browsers cannot copy native PPT shapes to the clipboard. SVG is the best alternative:
1. Export/Copy the SVG from Obsidian
2. Insert the SVG into PowerPoint (Insert → Pictures, or drag & drop)
3. Right-click → **"Convert to Shape"** (Office 365 / 2019+)
4. Every bar, milestone, label, and arrow becomes a fully editable PowerPoint shape

The generated SVG uses only standard elements (`rect`, `line`, `text`, `path`) — no `foreignObject`, no raster images — so PowerPoint conversion is lossless.

### Usage

Create a ` ```thinkcell ` code block in any note:

````markdown
```thinkcell
title: Q4 Product Launch
showToday: true
tasks:
  - name: Requirements
    start: 2026-10-01
    end: 2026-10-20
    status: done
    lane: Product
    owner: Alice
  - name: UI Design
    start: 2026-10-15
    end: 2026-11-10
    status: in-progress
    progress: 60
    lane: Design
    dependsOn: [Requirements]
  - name: Beta Release
    start: 2026-12-16
    milestone: true
    lane: Release
  - name: GA Launch
    start: 2027-01-15
    milestone: true
    lane: Release
    dependsOn: [Beta Release]
```
````

### Plan Fields

| Field | Required | Description |
|-------|----------|-------------|
| `title` | No | Chart title |
| `start` / `end` | No | Overall time range (auto-calculated if omitted) |
| `showToday` | No | Show today line (default `true`) |
| `tasks` | **Yes** | List of tasks |

### Task Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | Task name |
| `start` | **Yes** | Start date `YYYY-MM-DD` |
| `end` | For tasks | End date (omit if `milestone: true`) |
| `milestone` | No | Render as diamond milestone |
| `status` | No | `todo` / `in-progress` / `done` / `delayed` |
| `progress` | No | 0–100, darkens the bar proportionally |
| `owner` | No | Shown after task name |
| `lane` | No | Swimlane grouping |
| `color` | No | Custom bar color (overrides status color) |
| `dependsOn` | No | List of task names; draws dependency arrows |

### Features

- **16:9 canvas** (1280×720, matching PPT default slide)
- Task bars with **progress shading** and date labels
- **Milestones** (red diamonds)
- **Dependency arrows** between tasks
- **Swimlanes** with headers
- **Today line** (red dashed)
- Auto time scale: weekly (≤45 days), monthly (≤240 days), quarterly
- Status **legend** at bottom
- Think-Cell style color palette
- **Copy SVG** to clipboard or **Export SVG** file, both with PowerPoint editing instructions

### Installation

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/yanqingwang/obsidian-thinkcell-planner/releases/latest)
2. Copy to `{vault}/.obsidian/plugins/thinkcell-planner/`
3. Enable in Settings → Community Plugins

### Build from Source

```bash
git clone https://github.com/yanqingwang/obsidian-thinkcell-planner.git
cd obsidian-thinkcell-planner
npm install
npm run build
```

### License

MIT

---

## 中文

在 Obsidian 中直接创建 **Think-Cell 风格的项目管理计划甘特图**。以 **16:9 PPT 尺寸（1280×720）** 渲染，导出**标准 SVG**，可在 PowerPoint 中转换为可编辑形状。

### 为什么选择 SVG 方案？

浏览器无法直接复制 PPT 原生形状，SVG 是最佳替代方案：
1. 从 Obsidian 导出/复制 SVG
2. 将 SVG 插入 PowerPoint（插入 → 图片，或直接拖入）
3. 右键 → **"转换为形状"**（Office 365 / 2019+）
4. 每个任务条、里程碑、标签、箭头都变成完全可编辑的 PPT 形状

生成的 SVG 只使用标准元素（`rect`、`line`、`text`、`path`），无 `foreignObject`、无位图，PowerPoint 转换无损。

### 使用方法

在任意笔记中创建 ` ```thinkcell ` 代码块：

````markdown
```thinkcell
title: Q4 产品发布计划
showToday: true
tasks:
  - name: 需求分析
    start: 2026-10-01
    end: 2026-10-20
    status: done
    lane: 产品
    owner: 张三
  - name: UI 设计
    start: 2026-10-15
    end: 2026-11-10
    status: in-progress
    progress: 60
    lane: 设计
    dependsOn: [需求分析]
  - name: 内测发布
    start: 2026-12-16
    milestone: true
    lane: 发布
  - name: 正式发布
    start: 2027-01-15
    milestone: true
    lane: 发布
    dependsOn: [内测发布]
```
````

### 计划字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 否 | 图表标题 |
| `start` / `end` | 否 | 整体时间范围（省略时自动计算） |
| `showToday` | 否 | 显示今日线（默认 `true`） |
| `tasks` | **是** | 任务列表 |

### 任务字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | **是** | 任务名称 |
| `start` | **是** | 开始日期 `YYYY-MM-DD` |
| `end` | 任务必填 | 结束日期（里程碑可省略） |
| `milestone` | 否 | 渲染为菱形里程碑 |
| `status` | 否 | `todo` / `in-progress` / `done` / `delayed` |
| `progress` | 否 | 0–100，按比例加深任务条 |
| `owner` | 否 | 负责人，显示在任务名后 |
| `lane` | 否 | 泳道分组 |
| `color` | 否 | 自定义颜色（覆盖状态颜色） |
| `dependsOn` | 否 | 依赖任务名列表，绘制依赖箭头 |

### 功能特性

- **16:9 画布**（1280×720，与 PPT 默认幻灯片一致）
- 任务条带**进度阴影**和日期标签
- **里程碑**（红色菱形）
- 任务间**依赖箭头**
- **泳道分组**带标题
- **今日线**（红色虚线）
- 自动时间刻度：周（≤45 天）、月（≤240 天）、季度
- 底部状态**图例**
- Think-Cell 风格配色
- **复制 SVG** 到剪贴板或**导出 SVG** 文件，均附带 PPT 编辑说明

### 安装

1. 从 [最新 release](https://github.com/yanqingwang/obsidian-thinkcell-planner/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`
2. 复制到 `{vault}/.obsidian/plugins/thinkcell-planner/`
3. 在 设置 → 第三方插件 中启用

### 从源码构建

```bash
git clone https://github.com/yanqingwang/obsidian-thinkcell-planner.git
cd obsidian-thinkcell-planner
npm install
npm run build
```

### 许可证

MIT
