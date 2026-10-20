import { ParsedPlan, ParsedTask, STATUS_COLORS, MILESTONE_COLOR } from './types';
import { formatDate } from './parser';

/** 16:9 PPT 画布（PowerPoint 默认 13.33x7.5 英寸 = 1280x720 @96dpi） */
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

/** 布局常量（导出给 main.ts 做像素→日期反算） */
export const MARGIN = { top: 90, right: 40, bottom: 60, left: 220 };
const TITLE_HEIGHT = 50;
const AXIS_HEIGHT = 40;
const ROW_HEIGHT = 32;
const LANE_HEADER_HEIGHT = 28;
const BAR_HEIGHT = 18;
const MILESTONE_SIZE = 12;

const FONT_FAMILY = 'Calibri, Arial, Microsoft YaHei, sans-serif';
const COLOR_TEXT = '#262626';
const COLOR_GRID = '#D9D9D9';
const COLOR_AXIS = '#595959';
const COLOR_TODAY = '#FF0000';
const COLOR_LANE_BG = '#F2F2F2';

interface TimeScale {
    x: (d: Date) => number;
    ticks: Date[];
    tickFormat: (d: Date) => string;
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * 根据时间跨度选择刻度粒度（日/周/月）
 */
function buildTimeScale(start: Date, end: Date, width: number): TimeScale {
    const spanMs = end.getTime() - start.getTime();
    const spanDays = spanMs / (24 * 3600 * 1000);

    let stepMs: number;
    let tickFormat: (d: Date) => string;

    if (spanDays <= 45) {
        // 日刻度（每 7 天一个标签）
        stepMs = 7 * 24 * 3600 * 1000;
        tickFormat = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (spanDays <= 240) {
        // 月刻度
        stepMs = 0; // 特殊处理：按月
        tickFormat = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else {
        // 季度刻度
        stepMs = 0; // 特殊处理：按季度
        tickFormat = (d) => `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
    }

    const x = (d: Date): number => {
        const ratio = (d.getTime() - start.getTime()) / spanMs;
        return MARGIN.left + ratio * width;
    };

    // 生成刻度
    const ticks: Date[] = [];
    if (stepMs > 0) {
        // 对齐到周一
        const first = new Date(start);
        const day = first.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        first.setDate(first.getDate() - diff);
        let t = first.getTime();
        while (t <= end.getTime()) {
            if (t >= start.getTime()) {
                ticks.push(new Date(t));
            }
            t += stepMs;
        }
    } else if (spanDays <= 240) {
        // 每月 1 日
        const cur = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cur.getTime() <= end.getTime()) {
            if (cur.getTime() >= start.getTime()) {
                ticks.push(new Date(cur));
            }
            cur.setMonth(cur.getMonth() + 1);
        }
    } else {
        // 每季度
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

function taskColor(t: ParsedTask): string {
    if (t.color) return t.color;
    if (t.milestone) return MILESTONE_COLOR;
    return STATUS_COLORS[t.status || 'todo'];
}

/**
 * 渲染甘特图为 SVG 字符串（纯标准元素，PowerPoint 可转换为形状）
 * @returns SVG 字符串 + 坐标映射（task name → 位置），用于交互式拖拽
 */
export function renderGanttSvg(plan: ParsedPlan): { svg: string; coords: Map<string, { x1: number; x2: number; cy: number; milestone: boolean }> } {
    const chartWidth = CANVAS_WIDTH - MARGIN.left - MARGIN.right;
    const scale = buildTimeScale(plan.startDate, plan.endDate, chartWidth);

    // 计算内容行（考虑泳道标题行）
    interface Row {
        kind: 'lane' | 'task';
        task?: ParsedTask;
        laneName?: string;
    }
    const rows: Row[] = [];
    if (plan.lanes.length > 0) {
        const byLane = new Map<string, ParsedTask[]>();
        const noLane: ParsedTask[] = [];
        for (const t of plan.tasks) {
            if (t.lane) {
                const arr = byLane.get(t.lane) || [];
                arr.push(t);
                byLane.set(t.lane, arr);
            } else {
                noLane.push(t);
            }
        }
        for (const t of noLane) rows.push({ kind: 'task', task: t });
        for (const lane of plan.lanes) {
            rows.push({ kind: 'lane', laneName: lane });
            for (const t of byLane.get(lane) || []) {
                rows.push({ kind: 'task', task: t });
            }
        }
    } else {
        for (const t of plan.tasks) rows.push({ kind: 'task', task: t });
    }

    const bodyHeight = rows.reduce((h, r) => h + (r.kind === 'lane' ? LANE_HEADER_HEIGHT : ROW_HEIGHT), 0);
    const totalHeight = MARGIN.top + bodyHeight + MARGIN.bottom;
    // 保持 16:9 画布：内容不足时垂直留白，超出时加高（用户可自行缩放）
    const svgHeight = Math.max(CANVAS_HEIGHT, totalHeight);

    const parts: string[] = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${svgHeight}" viewBox="0 0 ${CANVAS_WIDTH} ${svgHeight}" font-family="${FONT_FAMILY}">`
    );
    // 背景
    parts.push(`<rect x="0" y="0" width="${CANVAS_WIDTH}" height="${svgHeight}" fill="#FFFFFF"/>`);

    // 坐标映射，用于交互式拖拽
    const coords = new Map<string, { x1: number; x2: number; cy: number; milestone: boolean }>();

    // 标题
    parts.push(
        `<text x="${CANVAS_WIDTH / 2}" y="${MARGIN.top - AXIS_HEIGHT - 12}" text-anchor="middle" font-size="26" font-weight="bold" fill="${COLOR_TEXT}">${escapeXml(plan.title)}</text>`
    );

    const chartTop = MARGIN.top;
    const chartBottom = chartTop + bodyHeight;

    // 时间刻度与网格
    for (const tick of scale.ticks) {
        const tx = scale.x(tick);
        parts.push(`<line x1="${tx}" y1="${chartTop}" x2="${tx}" y2="${chartBottom}" stroke="${COLOR_GRID}" stroke-width="1"/>`);
        parts.push(
            `<text x="${tx}" y="${chartTop - 10}" text-anchor="middle" font-size="13" fill="${COLOR_AXIS}">${escapeXml(scale.tickFormat(tick))}</text>`
        );
    }
    // 轴线
    parts.push(`<line x1="${MARGIN.left}" y1="${chartTop - 2}" x2="${CANVAS_WIDTH - MARGIN.right}" y2="${chartTop - 2}" stroke="${COLOR_AXIS}" stroke-width="1.5"/>`);
    parts.push(`<line x1="${MARGIN.left}" y1="${chartBottom}" x2="${CANVAS_WIDTH - MARGIN.right}" y2="${chartBottom}" stroke="${COLOR_AXIS}" stroke-width="1.5"/>`);

    // 今日线
    if (plan.showToday) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (today >= plan.startDate && today <= plan.endDate) {
            const tx = scale.x(today);
            parts.push(`<line x1="${tx}" y1="${chartTop - 4}" x2="${tx}" y2="${chartBottom}" stroke="${COLOR_TODAY}" stroke-width="2" stroke-dasharray="6,3"/>`);
        }
    }

    // 行内容
    let cursorY = chartTop;
    const taskBarCenters = new Map<string, { x1: number; x2: number; cy: number }>();

    for (const row of rows) {
        if (row.kind === 'lane') {
            parts.push(
                `<rect x="0" y="${cursorY}" width="${CANVAS_WIDTH}" height="${LANE_HEADER_HEIGHT}" fill="${COLOR_LANE_BG}"/>`
            );
            parts.push(
                `<text x="${MARGIN.left - 10}" y="${cursorY + LANE_HEADER_HEIGHT / 2 + 5}" text-anchor="end" font-size="14" font-weight="bold" fill="${COLOR_TEXT}">${escapeXml(row.laneName || '')}</text>`
            );
            cursorY += LANE_HEADER_HEIGHT;
            continue;
        }

        const t = row.task!;
        const rowY = cursorY;
        const barCy = rowY + ROW_HEIGHT / 2;
        cursorY += ROW_HEIGHT;

        // 任务名（左列）
        const label = t.owner ? `${t.name} · ${t.owner}` : t.name;
        parts.push(
            `<text x="${MARGIN.left - 10}" y="${barCy + 4}" text-anchor="end" font-size="13" fill="${COLOR_TEXT}">${escapeXml(label)}</text>`
        );

        const x1 = scale.x(t.startDate);
        const x2 = scale.x(t.endDate);
        const color = taskColor(t);

        if (t.milestone) {
            // 菱形里程碑
            const cx = x1;
            parts.push(
                `<path d="M ${cx} ${barCy - MILESTONE_SIZE} L ${cx + MILESTONE_SIZE} ${barCy} L ${cx} ${barCy + MILESTONE_SIZE} L ${cx - MILESTONE_SIZE} ${barCy} Z" fill="${color}" stroke="#FFFFFF" stroke-width="1" data-tc-task="${escapeXml(t.name)}" data-tc-milestone="1"/>`
            );
            taskBarCenters.set(t.name, { x1: cx, x2: cx, cy: barCy });
            coords.set(t.name, { x1: cx, x2: cx, cy: barCy, milestone: true });
        } else {
            const bw = Math.max(x2 - x1, 3);
            // 主条
            parts.push(
                `<rect x="${x1}" y="${barCy - BAR_HEIGHT / 2}" width="${bw}" height="${BAR_HEIGHT}" fill="${color}" rx="2" data-tc-task="${escapeXml(t.name)}" data-tc-bar="1" data-tc-drag="body"/>`
            );
            // 进度条（也可拖）
            if (t.progress !== undefined && t.progress > 0) {
                const pw = (bw * Math.min(t.progress, 100)) / 100;
                parts.push(
                    `<rect x="${x1}" y="${barCy - BAR_HEIGHT / 2}" width="${pw}" height="${BAR_HEIGHT}" fill="#000000" opacity="0.25" rx="2" data-tc-task="${escapeXml(t.name)}" data-tc-drag="body" pointer-events="none"/>`
                );
            }
            // 端点（不可见透明 rect，专门用来捕获左右拖拽）
            const endHit = 6;
            parts.push(
                `<rect x="${x1 - endHit}" y="${barCy - BAR_HEIGHT / 2 - 2}" width="${endHit * 2}" height="${BAR_HEIGHT + 4}" fill="transparent" data-tc-task="${escapeXml(t.name)}" data-tc-drag="left"/>`
            );
            parts.push(
                `<rect x="${x2 - endHit}" y="${barCy - BAR_HEIGHT / 2 - 2}" width="${endHit * 2}" height="${BAR_HEIGHT + 4}" fill="transparent" data-tc-task="${escapeXml(t.name)}" data-tc-drag="right"/>`
            );
            // 日期标签（条右侧）
            parts.push(
                `<text x="${x2 + 6}" y="${barCy + 4}" font-size="11" fill="${COLOR_AXIS}">${formatDate(t.startDate)} – ${formatDate(t.endDate)}</text>`
            );
            taskBarCenters.set(t.name, { x1, x2, cy: barCy });
            coords.set(t.name, { x1, x2, cy: barCy, milestone: false });
        }
    }

    // 依赖箭头
    for (const t of plan.tasks) {
        if (!t.dependsOn || t.dependsOn.length === 0) continue;
        const to = taskBarCenters.get(t.name);
        if (!to) continue;
        for (const depName of t.dependsOn) {
            const from = taskBarCenters.get(depName);
            if (!from) continue;
            // 从 from.x2 到 to.x1 的三段折线
            const startX = from.x2 + 4;
            const endX = to.x1 - 4;
            const midX = (startX + endX) / 2;
            parts.push(
                `<path d="M ${from.x2} ${from.cy} L ${midX} ${from.cy} L ${midX} ${to.cy} L ${to.x1} ${to.cy}" fill="none" stroke="${COLOR_AXIS}" stroke-width="1.2" marker-end="url(#tcArrow)"/>`
            );
        }
    }

    // 箭头 marker 定义
    parts.push(
        `<defs><marker id="tcArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${COLOR_AXIS}"/></marker></defs>`
    );

    // 图例（底部）
    const legendY = chartBottom + 36;
    const legendItems: Array<{ label: string; color: string }> = [
        { label: 'To Do', color: STATUS_COLORS['todo'] },
        { label: 'In Progress', color: STATUS_COLORS['in-progress'] },
        { label: 'Done', color: STATUS_COLORS['done'] },
        { label: 'Delayed', color: STATUS_COLORS['delayed'] },
        { label: 'Milestone', color: MILESTONE_COLOR },
    ];
    let legendX = MARGIN.left;
    for (const item of legendItems) {
        parts.push(`<rect x="${legendX}" y="${legendY - 10}" width="14" height="14" fill="${item.color}" rx="2"/>`);
        parts.push(`<text x="${legendX + 20}" y="${legendY + 2}" font-size="12" fill="${COLOR_TEXT}">${item.label}</text>`);
        legendX += 20 + item.label.length * 7 + 26;
    }

    parts.push('</svg>');
    return { svg: parts.join('\n'), coords };
}
