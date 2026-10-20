var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ThinkCellPlannerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/parser.ts
var DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(s, fieldName) {
  if (!DATE_REGEX.test(s)) {
    throw new Error(`Invalid date format for ${fieldName}: "${s}". Use YYYY-MM-DD.`);
  }
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date for ${fieldName}: "${s}".`);
  }
  return d;
}
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseSimpleYaml(text) {
  const result = {};
  const lines = text.split("\n");
  let i = 0;
  const parseValue = (raw) => {
    const v = raw.trim();
    if (v === "true")
      return true;
    if (v === "false")
      return false;
    if (v === "null" || v === "")
      return null;
    if (/^-?\d+(\.\d+)?$/.test(v))
      return Number(v);
    if (v.startsWith("[") && v.endsWith("]")) {
      const inner = v.slice(1, -1).trim();
      if (!inner)
        return [];
      return inner.split(",").map((s) => {
        const t = s.trim();
        return t.replace(/^["']|["']$/g, "");
      });
    }
    return v.replace(/^["']|["']$/g, "");
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const topMatch = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(line);
    if (!topMatch) {
      i++;
      continue;
    }
    const key = topMatch[1];
    const rest = topMatch[2];
    if (key === "tasks" && rest === "") {
      const tasks = [];
      i++;
      let current = null;
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          i++;
          continue;
        }
        const indent = l.length - l.trimStart().length;
        const trimmed = l.trim();
        if (trimmed.startsWith("- ")) {
          if (current)
            tasks.push(current);
          current = {};
          const kv = /^-\s+([a-zA-Z_][\w-]*):\s*(.*)$/.exec(trimmed);
          if (kv) {
            current[kv[1]] = parseValue(kv[2]);
          }
          i++;
        } else if (indent >= 4 && current) {
          const kv = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(trimmed);
          if (kv) {
            current[kv[1]] = parseValue(kv[2]);
          }
          i++;
        } else if (indent === 0) {
          break;
        } else {
          i++;
        }
      }
      if (current)
        tasks.push(current);
      result.tasks = tasks;
      continue;
    }
    result[key] = parseValue(rest);
    i++;
  }
  return result;
}
function parsePlan(source) {
  const raw = parseSimpleYaml(source);
  if (!raw.tasks || !Array.isArray(raw.tasks) || raw.tasks.length === 0) {
    throw new Error('No tasks defined. Add at least one task under "tasks:".');
  }
  const parsedTasks = [];
  const lanes = [];
  const laneSet = /* @__PURE__ */ new Set();
  raw.tasks.forEach((t, idx) => {
    var _a;
    if (!t.name) {
      throw new Error(`Task #${idx + 1} is missing "name".`);
    }
    if (!t.start) {
      throw new Error(`Task "${t.name}" is missing "start" date.`);
    }
    const startDate2 = parseDate(t.start, `task "${t.name}" start`);
    let endDate2;
    if (t.milestone) {
      endDate2 = startDate2;
    } else {
      if (!t.end) {
        throw new Error(`Task "${t.name}" is missing "end" date (or set milestone: true).`);
      }
      endDate2 = parseDate(t.end, `task "${t.name}" end`);
      if (endDate2 < startDate2) {
        throw new Error(`Task "${t.name}": end date is before start date.`);
      }
    }
    const lane = t.lane || "";
    if (lane && !laneSet.has(lane)) {
      laneSet.add(lane);
      lanes.push(lane);
    }
    const rawDeps = (_a = t.dependsOn) != null ? _a : t.depends;
    const dependsOn = rawDeps && Array.isArray(rawDeps) && rawDeps.length > 0 ? rawDeps.filter((x) => typeof x === "string" && x.length > 0) : void 0;
    parsedTasks.push({
      ...t,
      dependsOn,
      startDate: startDate2,
      endDate: endDate2,
      rowIndex: idx
    });
  });
  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const t of parsedTasks) {
    minTime = Math.min(minTime, t.startDate.getTime());
    maxTime = Math.max(maxTime, t.endDate.getTime());
  }
  let startDate;
  let endDate;
  if (raw.start) {
    startDate = parseDate(raw.start, "plan start");
  } else {
    startDate = new Date(minTime);
  }
  if (raw.end) {
    endDate = parseDate(raw.end, "plan end");
  } else {
    endDate = new Date(maxTime);
  }
  const span = endDate.getTime() - startDate.getTime();
  if (span < 7 * 24 * 3600 * 1e3) {
    endDate = new Date(startDate.getTime() + 7 * 24 * 3600 * 1e3);
  }
  return {
    title: raw.title || "Project Plan",
    startDate,
    endDate,
    showToday: raw.showToday !== false,
    tasks: parsedTasks,
    lanes
  };
}

// src/types.ts
var STATUS_COLORS = {
  "todo": "#A6A6A6",
  "in-progress": "#4472C4",
  "done": "#70AD47",
  "delayed": "#ED7D31"
};
var MILESTONE_COLOR = "#C00000";

// src/renderer.ts
var CANVAS_WIDTH = 1280;
var CANVAS_HEIGHT = 720;
var MARGIN = { top: 90, right: 40, bottom: 60, left: 220 };
var AXIS_HEIGHT = 40;
var ROW_HEIGHT = 32;
var LANE_HEADER_HEIGHT = 28;
var BAR_HEIGHT = 18;
var MILESTONE_SIZE = 12;
var FONT_FAMILY = "Calibri, Arial, Microsoft YaHei, sans-serif";
var COLOR_TEXT = "#262626";
var COLOR_GRID = "#D9D9D9";
var COLOR_AXIS = "#595959";
var COLOR_TODAY = "#FF0000";
var COLOR_LANE_BG = "#F2F2F2";
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function buildTimeScale(start, end, width) {
  const spanMs = end.getTime() - start.getTime();
  const spanDays = spanMs / (24 * 3600 * 1e3);
  let stepMs;
  let tickFormat;
  if (spanDays <= 45) {
    stepMs = 7 * 24 * 3600 * 1e3;
    tickFormat = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  } else if (spanDays <= 240) {
    stepMs = 0;
    tickFormat = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } else {
    stepMs = 0;
    tickFormat = (d) => `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
  }
  const x = (d) => {
    const ratio = (d.getTime() - start.getTime()) / spanMs;
    return MARGIN.left + ratio * width;
  };
  const ticks = [];
  if (stepMs > 0) {
    const first = new Date(start);
    const day = first.getDay();
    const diff = day === 0 ? 6 : day - 1;
    first.setDate(first.getDate() - diff);
    let t = first.getTime();
    while (t <= end.getTime()) {
      if (t >= start.getTime()) {
        ticks.push(new Date(t));
      }
      t += stepMs;
    }
  } else if (spanDays <= 240) {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur.getTime() <= end.getTime()) {
      if (cur.getTime() >= start.getTime()) {
        ticks.push(new Date(cur));
      }
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    const qStartMonth = Math.floor(start.getMonth() / 3) * 3;
    const cur = new Date(start.getFullYear(), qStartMonth, 1);
    while (cur.getTime() <= end.getTime()) {
      if (cur.getTime() >= start.getTime()) {
        ticks.push(new Date(cur));
      }
      cur.setMonth(cur.getMonth() + 3);
    }
  }
  return { x, ticks, tickFormat };
}
function taskColor(t) {
  if (t.color)
    return t.color;
  if (t.milestone)
    return MILESTONE_COLOR;
  return STATUS_COLORS[t.status || "todo"];
}
function renderGanttSvg(plan) {
  const chartWidth = CANVAS_WIDTH - MARGIN.left - MARGIN.right;
  const scale = buildTimeScale(plan.startDate, plan.endDate, chartWidth);
  const rows = [];
  if (plan.lanes.length > 0) {
    const byLane = /* @__PURE__ */ new Map();
    const noLane = [];
    for (const t of plan.tasks) {
      if (t.lane) {
        const arr = byLane.get(t.lane) || [];
        arr.push(t);
        byLane.set(t.lane, arr);
      } else {
        noLane.push(t);
      }
    }
    for (const t of noLane)
      rows.push({ kind: "task", task: t });
    for (const lane of plan.lanes) {
      rows.push({ kind: "lane", laneName: lane });
      for (const t of byLane.get(lane) || []) {
        rows.push({ kind: "task", task: t });
      }
    }
  } else {
    for (const t of plan.tasks)
      rows.push({ kind: "task", task: t });
  }
  const bodyHeight = rows.reduce((h, r) => h + (r.kind === "lane" ? LANE_HEADER_HEIGHT : ROW_HEIGHT), 0);
  const totalHeight = MARGIN.top + bodyHeight + MARGIN.bottom;
  const svgHeight = Math.max(CANVAS_HEIGHT, totalHeight);
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${svgHeight}" viewBox="0 0 ${CANVAS_WIDTH} ${svgHeight}" font-family="${FONT_FAMILY}">`
  );
  parts.push(`<rect x="0" y="0" width="${CANVAS_WIDTH}" height="${svgHeight}" fill="#FFFFFF"/>`);
  const coords = /* @__PURE__ */ new Map();
  parts.push(
    `<text x="${CANVAS_WIDTH / 2}" y="${MARGIN.top - AXIS_HEIGHT - 12}" text-anchor="middle" font-size="26" font-weight="bold" fill="${COLOR_TEXT}">${escapeXml(plan.title)}</text>`
  );
  const chartTop = MARGIN.top;
  const chartBottom = chartTop + bodyHeight;
  for (const tick of scale.ticks) {
    const tx = scale.x(tick);
    parts.push(`<line x1="${tx}" y1="${chartTop}" x2="${tx}" y2="${chartBottom}" stroke="${COLOR_GRID}" stroke-width="1"/>`);
    parts.push(
      `<text x="${tx}" y="${chartTop - 10}" text-anchor="middle" font-size="13" fill="${COLOR_AXIS}">${escapeXml(scale.tickFormat(tick))}</text>`
    );
  }
  parts.push(`<line x1="${MARGIN.left}" y1="${chartTop - 2}" x2="${CANVAS_WIDTH - MARGIN.right}" y2="${chartTop - 2}" stroke="${COLOR_AXIS}" stroke-width="1.5"/>`);
  parts.push(`<line x1="${MARGIN.left}" y1="${chartBottom}" x2="${CANVAS_WIDTH - MARGIN.right}" y2="${chartBottom}" stroke="${COLOR_AXIS}" stroke-width="1.5"/>`);
  if (plan.showToday) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today >= plan.startDate && today <= plan.endDate) {
      const tx = scale.x(today);
      parts.push(`<line x1="${tx}" y1="${chartTop - 4}" x2="${tx}" y2="${chartBottom}" stroke="${COLOR_TODAY}" stroke-width="2" stroke-dasharray="6,3"/>`);
    }
  }
  let cursorY = chartTop;
  const taskBarCenters = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.kind === "lane") {
      parts.push(
        `<rect x="0" y="${cursorY}" width="${CANVAS_WIDTH}" height="${LANE_HEADER_HEIGHT}" fill="${COLOR_LANE_BG}"/>`
      );
      parts.push(
        `<text x="${MARGIN.left - 10}" y="${cursorY + LANE_HEADER_HEIGHT / 2 + 5}" text-anchor="end" font-size="14" font-weight="bold" fill="${COLOR_TEXT}">${escapeXml(row.laneName || "")}</text>`
      );
      cursorY += LANE_HEADER_HEIGHT;
      continue;
    }
    const t = row.task;
    const rowY = cursorY;
    const barCy = rowY + ROW_HEIGHT / 2;
    cursorY += ROW_HEIGHT;
    const label = t.owner ? `${t.name} \xB7 ${t.owner}` : t.name;
    parts.push(
      `<text x="${MARGIN.left - 10}" y="${barCy + 4}" text-anchor="end" font-size="13" fill="${COLOR_TEXT}">${escapeXml(label)}</text>`
    );
    const x1 = scale.x(t.startDate);
    const x2 = scale.x(t.endDate);
    const color = taskColor(t);
    if (t.milestone) {
      const cx = x1;
      parts.push(
        `<path d="M ${cx} ${barCy - MILESTONE_SIZE} L ${cx + MILESTONE_SIZE} ${barCy} L ${cx} ${barCy + MILESTONE_SIZE} L ${cx - MILESTONE_SIZE} ${barCy} Z" fill="${color}" stroke="#FFFFFF" stroke-width="1" data-tc-task="${escapeXml(t.name)}" data-tc-milestone="1"/>`
      );
      taskBarCenters.set(t.name, { x1: cx, x2: cx, cy: barCy });
      coords.set(t.name, { x1: cx, x2: cx, cy: barCy, milestone: true });
    } else {
      const bw = Math.max(x2 - x1, 3);
      parts.push(
        `<rect x="${x1}" y="${barCy - BAR_HEIGHT / 2}" width="${bw}" height="${BAR_HEIGHT}" fill="${color}" rx="2" data-tc-task="${escapeXml(t.name)}" data-tc-bar="1" data-tc-drag="body"/>`
      );
      if (t.progress !== void 0 && t.progress > 0) {
        const pw = bw * Math.min(t.progress, 100) / 100;
        parts.push(
          `<rect x="${x1}" y="${barCy - BAR_HEIGHT / 2}" width="${pw}" height="${BAR_HEIGHT}" fill="#000000" opacity="0.25" rx="2" data-tc-task="${escapeXml(t.name)}" data-tc-drag="body" pointer-events="none"/>`
        );
      }
      const endHit = 6;
      parts.push(
        `<rect x="${x1 - endHit}" y="${barCy - BAR_HEIGHT / 2 - 2}" width="${endHit * 2}" height="${BAR_HEIGHT + 4}" fill="transparent" data-tc-task="${escapeXml(t.name)}" data-tc-drag="left"/>`
      );
      parts.push(
        `<rect x="${x2 - endHit}" y="${barCy - BAR_HEIGHT / 2 - 2}" width="${endHit * 2}" height="${BAR_HEIGHT + 4}" fill="transparent" data-tc-task="${escapeXml(t.name)}" data-tc-drag="right"/>`
      );
      parts.push(
        `<text x="${x2 + 6}" y="${barCy + 4}" font-size="11" fill="${COLOR_AXIS}">${formatDate(t.startDate)} \u2013 ${formatDate(t.endDate)}</text>`
      );
      taskBarCenters.set(t.name, { x1, x2, cy: barCy });
      coords.set(t.name, { x1, x2, cy: barCy, milestone: false });
    }
  }
  for (const t of plan.tasks) {
    if (!t.dependsOn || t.dependsOn.length === 0)
      continue;
    const to = taskBarCenters.get(t.name);
    if (!to)
      continue;
    for (const depName of t.dependsOn) {
      const from = taskBarCenters.get(depName);
      if (!from)
        continue;
      const startX = from.x2 + 4;
      const endX = to.x1 - 4;
      const midX = (startX + endX) / 2;
      parts.push(
        `<path d="M ${from.x2} ${from.cy} L ${midX} ${from.cy} L ${midX} ${to.cy} L ${to.x1} ${to.cy}" fill="none" stroke="${COLOR_AXIS}" stroke-width="1.2" marker-end="url(#tcArrow)"/>`
      );
    }
  }
  parts.push(
    `<defs><marker id="tcArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${COLOR_AXIS}"/></marker></defs>`
  );
  const legendY = chartBottom + 36;
  const legendItems = [
    { label: "To Do", color: STATUS_COLORS["todo"] },
    { label: "In Progress", color: STATUS_COLORS["in-progress"] },
    { label: "Done", color: STATUS_COLORS["done"] },
    { label: "Delayed", color: STATUS_COLORS["delayed"] },
    { label: "Milestone", color: MILESTONE_COLOR }
  ];
  let legendX = MARGIN.left;
  for (const item of legendItems) {
    parts.push(`<rect x="${legendX}" y="${legendY - 10}" width="14" height="14" fill="${item.color}" rx="2"/>`);
    parts.push(`<text x="${legendX + 20}" y="${legendY + 2}" font-size="12" fill="${COLOR_TEXT}">${item.label}</text>`);
    legendX += 20 + item.label.length * 7 + 26;
  }
  parts.push("</svg>");
  return { svg: parts.join("\n"), coords };
}

// src/geometry.ts
var CHART_WIDTH = CANVAS_WIDTH - MARGIN.left - MARGIN.right;
var DAY_MS = 864e5;
function pixelToDayOffset(dx, plan) {
  const spanMs = plan.endDate.getTime() - plan.startDate.getTime();
  const spanDays = Math.max(1, spanMs / DAY_MS);
  return Math.round(dx * spanDays / CHART_WIDTH);
}
function cloneDate(d) {
  return new Date(d.getTime());
}
function clampAndValidateDates(t, start, end) {
  if (t.milestone) {
    t.startDate = start;
    t.endDate = start;
    return;
  }
  if (end.getTime() < start.getTime() + DAY_MS) {
    end = new Date(start.getTime() + DAY_MS);
  }
  t.startDate = start;
  t.endDate = end;
}

// src/serializer.ts
var THINKCELL_BLOCK_RE = /```thinkcell\s*\n[\s\S]*?```/;
function serializePlan(plan) {
  const lines = [];
  if (plan.title !== "Project Plan")
    lines.push(`title: ${plan.title}`);
  lines.push(`start: ${formatDate(plan.startDate)}`);
  lines.push(`end: ${formatDate(plan.endDate)}`);
  if (!plan.showToday)
    lines.push("showToday: false");
  lines.push("tasks:");
  for (const t of plan.tasks) {
    lines.push(`  - name: ${t.name}`);
    lines.push(`    start: ${formatDate(t.startDate)}`);
    if (t.milestone) {
      lines.push(`    milestone: true`);
    } else {
      lines.push(`    end: ${formatDate(t.endDate)}`);
    }
    if (t.status)
      lines.push(`    status: ${t.status}`);
    if (t.owner)
      lines.push(`    owner: ${t.owner}`);
    if (t.progress !== void 0)
      lines.push(`    progress: ${t.progress}`);
    if (t.lane)
      lines.push(`    lane: ${t.lane}`);
    if (t.color)
      lines.push(`    color: ${t.color}`);
    if (t.dependsOn && t.dependsOn.length > 0) {
      lines.push(`    depends: [${t.dependsOn.join(", ")}]`);
    }
  }
  return lines.join("\n");
}

// src/main.ts
var ThinkCellPlannerPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor("thinkcell", (source, el, ctx) => {
      this.renderBlock(source, el, ctx.sourcePath);
    });
  }
  renderBlock(source, container, sourcePath) {
    container.empty();
    container.addClass("thinkcell-container");
    let plan;
    let svg;
    try {
      plan = parsePlan(source);
      const r = renderGanttSvg(plan);
      svg = r.svg;
    } catch (e) {
      const errDiv = container.createEl("div", { cls: "thinkcell-error" });
      errDiv.setText(`ThinkCell Planner Error:
${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const toolbar = container.createEl("div", { cls: "thinkcell-toolbar" });
    const copyBtn = toolbar.createEl("button", { cls: "thinkcell-btn", text: "Copy SVG" });
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(svg).then(() => {
        new import_obsidian.Notice('SVG copied. Paste into a .svg file, then insert into PowerPoint and "Convert to Shape" to edit.');
      });
    });
    const exportBtn = toolbar.createEl("button", { cls: "thinkcell-btn", text: "Export SVG" });
    exportBtn.addEventListener("click", () => {
      this.downloadSvg(svg);
    });
    const canvas = container.createEl("div", { cls: "thinkcell-canvas" });
    this.insertSvg(canvas, svg);
    this.bindDrag(canvas, plan, sourcePath);
  }
  insertSvg(canvas, svg) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const svgEl = doc.documentElement;
    canvas.appendChild(canvas.ownerDocument.importNode(svgEl, true));
    return canvas.querySelector("svg");
  }
  /** 在交互模式下重绘 SVG */
  rerender(canvas, plan) {
    const r = renderGanttSvg(plan);
    const old = canvas.querySelector("svg");
    if (old)
      old.remove();
    this.insertSvg(canvas, r.svg);
  }
  /** 把 plan 写回源文件里的 ```thinkcell 代码块 */
  async persistToFile(sourcePath, plan) {
    try {
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof import_obsidian.TFile))
        return;
      const content = await this.app.vault.read(file);
      const newBlock = "```thinkcell\n" + serializePlan(plan) + "\n```";
      const updated = content.replace(THINKCELL_BLOCK_RE, newBlock);
      if (updated !== content) {
        await this.app.vault.modify(file, updated);
      }
    } catch (e) {
      console.error("ThinkCell: persist failed", e);
    }
  }
  bindDrag(canvas, plan, sourcePath) {
    let drag = null;
    let dirty = false;
    let lastDayOffset = 0;
    const getSvgPoint = (ev) => {
      const cur = canvas.querySelector("svg");
      if (!cur)
        return 0;
      const rect = cur.getBoundingClientRect();
      const ratio = CANVAS_WIDTH / rect.width;
      return (ev.clientX - rect.left) * ratio;
    };
    const setDragCursor = (mode) => {
      document.body.removeClass("thinkcell-dragging-move");
      document.body.removeClass("thinkcell-dragging-resize");
      if (mode === null)
        return;
      document.body.addClass(
        mode === "left" || mode === "right" ? "thinkcell-dragging-resize" : "thinkcell-dragging-move"
      );
    };
    const onMove = (ev) => {
      if (!drag)
        return;
      const dx = getSvgPoint(ev) - drag.startX;
      const dayOffset = pixelToDayOffset(dx, plan);
      if (dayOffset === lastDayOffset)
        return;
      lastDayOffset = dayOffset;
      dirty = true;
      const t = drag.task;
      const s = cloneDate(drag.origStart);
      const e = cloneDate(drag.origEnd);
      if (drag.mode === "body" || drag.mode === "milestone") {
        s.setDate(s.getDate() + dayOffset);
        e.setDate(e.getDate() + dayOffset);
      } else if (drag.mode === "left") {
        s.setDate(s.getDate() + dayOffset);
      } else if (drag.mode === "right") {
        e.setDate(e.getDate() + dayOffset);
      }
      clampAndValidateDates(t, s, e);
      this.rerender(canvas, plan);
    };
    const onUp = () => {
      if (drag) {
        setDragCursor(null);
        drag = null;
        if (dirty) {
          void this.persistToFile(sourcePath, plan);
          new import_obsidian.Notice("Task updated and saved");
        }
      }
      lastDayOffset = 0;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    canvas.addEventListener("mousedown", (ev) => {
      const target = ev.target;
      const taskName = target.getAttribute ? target.getAttribute("data-tc-task") : null;
      if (!taskName)
        return;
      const task = plan.tasks.find((t) => t.name === taskName);
      if (!task)
        return;
      drag = {
        task,
        mode: target.getAttribute("data-tc-milestone") ? "milestone" : target.getAttribute("data-tc-drag") || "body",
        startX: getSvgPoint(ev),
        origStart: cloneDate(task.startDate),
        origEnd: cloneDate(task.endDate)
      };
      dirty = false;
      lastDayOffset = 0;
      setDragCursor(drag.mode);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      ev.preventDefault();
    });
  }
  downloadSvg(svg) {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.body.createEl("a", { href: url });
    a.download = `thinkcell-plan-${Date.now()}.svg`;
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    new import_obsidian.Notice('SVG exported. Insert into PowerPoint, right-click \u2192 "Convert to Shape" to edit.');
  }
};
