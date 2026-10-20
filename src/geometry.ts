/**
 * 拖拽几何计算（纯函数，不依赖 Obsidian，可独立测试）
 */
import { CANVAS_WIDTH, MARGIN } from './renderer';
import { ParsedPlan, ParsedTask } from './types';

export const CHART_WIDTH = CANVAS_WIDTH - MARGIN.left - MARGIN.right;

const DAY_MS = 86_400_000;

/** 像素偏移 → 天数（四舍五入到整天） */
export function pixelToDayOffset(dx: number, plan: ParsedPlan): number {
    const spanMs = plan.endDate.getTime() - plan.startDate.getTime();
    const spanDays = Math.max(1, spanMs / DAY_MS);
    return Math.round((dx * spanDays) / CHART_WIDTH);
}

export function cloneDate(d: Date): Date {
    return new Date(d.getTime());
}

/**
 * 应用拖拽结果到任务上（就地修改）
 * 里程碑：start = end；普通任务：最小 1 天跨度
 */
export function clampAndValidateDates(t: ParsedTask, start: Date, end: Date): void {
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
