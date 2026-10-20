import { ProjectPlan, ParsedPlan, ParsedTask, Task } from './types';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string, fieldName: string): Date {
    if (!DATE_REGEX.test(s)) {
        throw new Error(`Invalid date format for ${fieldName}: "${s}". Use YYYY-MM-DD.`);
    }
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) {
        throw new Error(`Invalid date for ${fieldName}: "${s}".`);
    }
    return d;
}

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * 极简 YAML 解析（仅支持本插件需要的子集）：
 * - 顶层标量: key: value
 * - 顶层布尔: key: true/false
 * - tasks: 数组，每个元素是 "- " 开头的 map
 * - 数组值: [a, b, c]
 */
function parseSimpleYaml(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = text.split('\n');
    let i = 0;

    const parseValue = (raw: string): unknown => {
        const v = raw.trim();
        if (v === 'true') return true;
        if (v === 'false') return false;
        if (v === 'null' || v === '') return null;
        if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
        if (v.startsWith('[') && v.endsWith(']')) {
            const inner = v.slice(1, -1).trim();
            if (!inner) return [];
            return inner.split(',').map((s) => {
                const t = s.trim();
                return t.replace(/^["']|["']$/g, '');
            });
        }
        return v.replace(/^["']|["']$/g, '');
    };

    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('#')) {
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

        if (key === 'tasks' && rest === '') {
            // 解析任务数组
            const tasks: Record<string, unknown>[] = [];
            i++;
            let current: Record<string, unknown> | null = null;
            while (i < lines.length) {
                const l = lines[i];
                if (!l.trim()) {
                    i++;
                    continue;
                }
                const indent = l.length - l.trimStart().length;
                const trimmed = l.trim();
                if (trimmed.startsWith('- ')) {
                    if (current) tasks.push(current);
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
            if (current) tasks.push(current);
            result.tasks = tasks;
            continue;
        }

        result[key] = parseValue(rest);
        i++;
    }

    return result;
}

export function parsePlan(source: string): ParsedPlan {
    const raw = parseSimpleYaml(source) as unknown as ProjectPlan;

    if (!raw.tasks || !Array.isArray(raw.tasks) || raw.tasks.length === 0) {
        throw new Error('No tasks defined. Add at least one task under "tasks:".');
    }

    const parsedTasks: ParsedTask[] = [];
    const lanes: string[] = [];
    const laneSet = new Set<string>();

    raw.tasks.forEach((t: Task, idx: number) => {
        if (!t.name) {
            throw new Error(`Task #${idx + 1} is missing "name".`);
        }
        if (!t.start) {
            throw new Error(`Task "${t.name}" is missing "start" date.`);
        }
        const startDate = parseDate(t.start, `task "${t.name}" start`);
        let endDate: Date;
        if (t.milestone) {
            endDate = startDate;
        } else {
            if (!t.end) {
                throw new Error(`Task "${t.name}" is missing "end" date (or set milestone: true).`);
            }
            endDate = parseDate(t.end, `task "${t.name}" end`);
            if (endDate < startDate) {
                throw new Error(`Task "${t.name}": end date is before start date.`);
            }
        }

        const lane = t.lane || '';
        if (lane && !laneSet.has(lane)) {
            laneSet.add(lane);
            lanes.push(lane);
        }

        // 兼容 depends / dependsOn 两种写法
        const rawDeps = t.dependsOn ?? (t as Task & { depends?: string[] }).depends;
        const dependsOn = rawDeps && Array.isArray(rawDeps) && rawDeps.length > 0
            ? rawDeps.filter((x): x is string => typeof x === 'string' && x.length > 0)
            : undefined;

        parsedTasks.push({
            ...t,
            dependsOn,
            startDate,
            endDate,
            rowIndex: idx,
        });
    });

    // 计算整体时间范围，前后各留 5% 边距
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const t of parsedTasks) {
        minTime = Math.min(minTime, t.startDate.getTime());
        maxTime = Math.max(maxTime, t.endDate.getTime());
    }

    let startDate: Date;
    let endDate: Date;
    if (raw.start) {
        startDate = parseDate(raw.start, 'plan start');
    } else {
        startDate = new Date(minTime);
    }
    if (raw.end) {
        endDate = parseDate(raw.end, 'plan end');
    } else {
        endDate = new Date(maxTime);
    }

    // 确保至少 7 天跨度，避免除零
    const span = endDate.getTime() - startDate.getTime();
    if (span < 7 * 24 * 3600 * 1000) {
        endDate = new Date(startDate.getTime() + 7 * 24 * 3600 * 1000);
    }

    return {
        title: raw.title || 'Project Plan',
        startDate,
        endDate,
        showToday: raw.showToday !== false,
        tasks: parsedTasks,
        lanes,
    };
}

export { formatDate };
