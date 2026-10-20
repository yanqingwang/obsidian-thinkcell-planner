/**
 * 把解析后的 plan 序列化回 thinkcell YAML（拖拽后写回源文件用）
 */
import { formatDate } from './parser';
import { ParsedPlan } from './types';

/** 匹配源文件中第一个 ```thinkcell 代码块 */
export const THINKCELL_BLOCK_RE = /```thinkcell\s*\n[\s\S]*?```/;

export function serializePlan(plan: ParsedPlan): string {
    const lines: string[] = [];
    if (plan.title !== 'Project Plan') lines.push(`title: ${plan.title}`);
    lines.push(`start: ${formatDate(plan.startDate)}`);
    lines.push(`end: ${formatDate(plan.endDate)}`);
    if (!plan.showToday) lines.push('showToday: false');
    lines.push('tasks:');
    for (const t of plan.tasks) {
        lines.push(`  - name: ${t.name}`);
        lines.push(`    start: ${formatDate(t.startDate)}`);
        if (t.milestone) {
            lines.push(`    milestone: true`);
        } else {
            lines.push(`    end: ${formatDate(t.endDate)}`);
        }
        if (t.status) lines.push(`    status: ${t.status}`);
        if (t.owner) lines.push(`    owner: ${t.owner}`);
        if (t.progress !== undefined) lines.push(`    progress: ${t.progress}`);
        if (t.lane) lines.push(`    lane: ${t.lane}`);
        if (t.color) lines.push(`    color: ${t.color}`);
        if (t.dependsOn && t.dependsOn.length > 0) {
            lines.push(`    depends: [${t.dependsOn.join(', ')}]`);
        }
    }
    return lines.join('\n');
}
