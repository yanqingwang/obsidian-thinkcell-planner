/**
 * ThinkCell Planner 自动化测试（5 轮）
 * 运行：npx esbuild test/runner.ts --bundle --platform=node --outfile=test/.bundle.cjs && node test/.bundle.cjs
 */
import { parsePlan } from '../src/parser';
import { renderGanttSvg, CANVAS_WIDTH, MARGIN } from '../src/renderer';
import { serializePlan, THINKCELL_BLOCK_RE } from '../src/serializer';
import { pixelToDayOffset, cloneDate, clampAndValidateDates, CHART_WIDTH } from '../src/geometry';
import { ParsedPlan, ParsedTask } from '../src/types';

// ---------- 测试框架 ----------
const roundFails: Record<number, string[]> = {};
let total = 0;

function check(round: number, cond: boolean, msg: string) {
    total++;
    if (!cond) {
        (roundFails[round] ??= []).push(msg);
    }
}

function eq(round: number, actual: unknown, expected: unknown, msg: string) {
    check(round, JSON.stringify(actual) === JSON.stringify(expected), `${msg} (actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)})`);
}

// ---------- 测试数据（与 vault 中 项目管理示例.md 一致） ----------
const SAMPLE = `title: 产品改版 Q4
start: 2026-10-15
end: 2027-01-31
showToday: true

tasks:
  - name: PRD 评审
    start: 2026-10-15
    end: 2026-10-20
    lane: 产品
    status: done

  - name: UI 设计
    start: 2026-10-21
    end: 2026-11-05
    lane: 设计
    status: in-progress
    progress: 60
    depends: [PRD 评审]

  - name: 开发迭代 1
    start: 2026-11-06
    end: 2026-11-25
    lane: 研发
    status: todo
    depends: [UI 设计]

  - name: 开发迭代 2
    start: 2026-11-26
    end: 2026-12-15
    lane: 研发
    status: todo
    depends: [开发迭代 1]

  - name: 测试 & 灰度
    start: 2026-12-16
    end: 2027-01-10
    lane: 质量
    status: todo
    depends: [开发迭代 2]

  - name: M1 里程碑
    start: 2027-01-10
    milestone: true
    lane: 质量

  - name: 正式上线
    start: 2027-01-25
    milestone: true
    lane: 研发
    depends: [开发迭代 2, 测试 & 灰度]
`;

const DAY = 86_400_000;
const d = (s: string) => new Date(s + 'T00:00:00');

function snapshot(p: ParsedPlan) {
    return {
        title: p.title,
        showToday: p.showToday,
        start: p.startDate.getTime(),
        end: p.endDate.getTime(),
        tasks: p.tasks.map((t) => ({
            n: t.name,
            s: t.startDate.getTime(),
            e: t.endDate.getTime(),
            m: !!t.milestone,
            st: t.status ?? null,
            o: t.owner ?? null,
            pr: t.progress ?? null,
            l: t.lane ?? null,
            c: t.color ?? null,
            d: (t.dependsOn ?? []).join('|'),
        })),
    };
}

// ========== Round 1：解析正确性 ==========
function round1() {
    const p = parsePlan(SAMPLE);
    check(1, !!p, 'plan 解析失败');
    eq(1, p.title, '产品改版 Q4', 'title');
    eq(1, p.startDate.getTime(), d('2026-10-15').getTime(), 'plan start');
    eq(1, p.endDate.getTime(), d('2027-01-31').getTime(), 'plan end');
    eq(1, p.showToday, true, 'showToday');
    eq(1, p.tasks.length, 7, '任务数量');
    eq(1, p.lanes.length, 4, '泳道数量(产品/设计/研发/质量)');

    const prd = p.tasks[0];
    eq(1, prd.name, 'PRD 评审', 'task0 name');
    eq(1, prd.startDate.getTime(), d('2026-10-15').getTime(), 'task0 start');
    eq(1, prd.endDate.getTime(), d('2026-10-20').getTime(), 'task0 end');
    eq(1, prd.status, 'done', 'task0 status');
    eq(1, prd.lane, '产品', 'task0 lane');

    const ui = p.tasks[1];
    eq(1, ui.progress, 60, 'UI 设计 progress');
    eq(1, ui.dependsOn, ['PRD 评审'], 'UI 设计 dependsOn');

    const m1 = p.tasks[5];
    check(1, !!m1.milestone, 'M1 应为里程碑');
    eq(1, m1.startDate.getTime(), m1.endDate.getTime(), '里程碑 start==end');

    const launch = p.tasks[6];
    eq(1, launch.dependsOn, ['开发迭代 2', '测试 & 灰度'], '上线依赖数组');

    // 特殊字符任务名
    const qa = p.tasks[4];
    eq(1, qa.name, '测试 & 灰度', '含 & 的任务名解析');
}

// ========== Round 2：序列化往返幂等 ==========
function round2() {
    const p1 = parsePlan(SAMPLE);
    const yaml2 = serializePlan(p1);
    const p2 = parsePlan(yaml2);
    eq(2, snapshot(p2), snapshot(p1), 'parse→serialize→parse 快照一致');

    // 再来一轮确认稳定不动点
    const yaml3 = serializePlan(p2);
    check(2, yaml3 === yaml2, '序列化是稳定不动点（第二次 serialize 无变化）');

    // 里程碑不产生 end 行
    check(2, !/milestone: true\n    end:/m.test(yaml2), '里程碑后不应跟 end 行');

    // 无 title/无 showToday 的最小 plan
    const minimal = parsePlan('tasks:\n  - name: A\n    start: 2026-01-01\n    end: 2026-01-02\n');
    const mSnap1 = snapshot(minimal);
    const minimal2 = parsePlan(serializePlan(minimal));
    eq(2, snapshot(minimal2), mSnap1, '最小 plan 往返一致');
}

// ========== Round 3：渲染产物完整性 ==========
function round3() {
    const p = parsePlan(SAMPLE);
    const { svg, coords } = renderGanttSvg(p);

    check(3, svg.startsWith('<svg'), 'SVG 以 <svg 开头');
    check(3, svg.trim().endsWith('</svg>'), 'SVG 以 </svg> 结尾');
    check(3, svg.includes(`width="${CANVAS_WIDTH}"`), `画布宽 ${CANVAS_WIDTH}`);

    // 每个 bar 有左右 hitbox（5 个非里程碑任务）
    eq(3, (svg.match(/data-tc-drag="left"/g) || []).length, 5, 'left hitbox 数量');
    eq(3, (svg.match(/data-tc-drag="right"/g) || []).length, 5, 'right hitbox 数量');
    eq(3, (svg.match(/data-tc-milestone="1"/g) || []).length, 2, '里程碑标记数量');

    // 每个任务都可被 data-tc-task 定位
    for (const t of p.tasks) {
        check(3, coords.has(t.name), `coords 缺少任务: ${t.name}`);
    }
    check(3, svg.includes('data-tc-task="测试 &amp; 灰度"'), '含 & 的任务名被正确转义');

    // 坐标在图表区内
    const prd = coords.get('PRD 评审')!;
    check(3, prd.x1 >= MARGIN.left, `bar 左端(${prd.x1}) 应 ≥ ${MARGIN.left}`);
    check(3, prd.x2 <= CANVAS_WIDTH - MARGIN.right, `bar 右端(${prd.x2}) 应 ≤ ${CANVAS_WIDTH - MARGIN.right}`);
    check(3, prd.x2 > prd.x1, 'bar 宽度 > 0');

    const m1 = coords.get('M1 里程碑')!;
    check(3, m1.milestone === true, 'M1 coords 标记为里程碑');
    check(3, m1.x1 === m1.x2, '里程碑为单点');

    // 里程碑日期换算：10-15 起点的图表，M1 在 2027-01-10
    const spanDays = (p.endDate.getTime() - p.startDate.getTime()) / DAY;
    const expectedRatio = (d('2027-01-10').getTime() - p.startDate.getTime()) / DAY / spanDays;
    const actualRatio = (m1.x1 - MARGIN.left) / CHART_WIDTH;
    check(3, Math.abs(actualRatio - expectedRatio) < 0.01, `里程碑 x 位置比例 ${actualRatio.toFixed(3)} ≈ ${expectedRatio.toFixed(3)}`);
}

// ========== Round 4：拖拽数学 ==========
function round4() {
    const p = parsePlan(SAMPLE);
    // 图表跨度 108 天（2026-10-15 → 2027-01-31）
    eq(4, pixelToDayOffset(CHART_WIDTH, p), 108, '全宽拖拽 = 108 天');
    eq(4, pixelToDayOffset(0, p), 0, '零位移 = 0 天');
    eq(4, pixelToDayOffset(CHART_WIDTH * 0.5, p), 54, '半宽 = 54 天');
    check(4, pixelToDayOffset(1, p) === 0 || pixelToDayOffset(1, p) === 1, '1px 在 0~1 天之间');

    // cloneDate 不共享引用
    const orig = d('2026-10-15');
    const cp = cloneDate(orig);
    cp.setDate(cp.getDate() + 5);
    eq(4, orig.getTime(), d('2026-10-15').getTime(), 'cloneDate 独立');

    // 里程碑整体平移 +3 天
    {
        const pp = parsePlan(SAMPLE);
        const m1 = pp.tasks[5];
        const s = cloneDate(m1.startDate);
        s.setDate(s.getDate() + 3);
        clampAndValidateDates(m1, s, s);
        eq(4, m1.startDate.getTime(), d('2027-01-13').getTime(), '里程碑 +3 天 start');
        eq(4, m1.endDate.getTime(), d('2027-01-13').getTime(), '里程碑 +3 天 end==start');
    }

    // body 整体平移 -2 天
    {
        const pp = parsePlan(SAMPLE);
        const t = pp.tasks[0];
        const s = cloneDate(t.startDate);
        s.setDate(s.getDate() - 2);
        const e = cloneDate(t.endDate);
        e.setDate(e.getDate() - 2);
        clampAndValidateDates(t, s, e);
        eq(4, t.startDate.getTime(), d('2026-10-13').getTime(), 'body -2 天 start');
        eq(4, t.endDate.getTime(), d('2026-10-18').getTime(), 'body -2 天 end');
    }

    // left 拖到 end 之后 → 钳制为最小 1 天跨度
    {
        const pp = parsePlan(SAMPLE);
        const t = pp.tasks[0]; // 10-15 → 10-20
        const s = d('2026-10-25'); // 拖过 end
        clampAndValidateDates(t, s, cloneDate(t.endDate));
        eq(4, t.startDate.getTime(), d('2026-10-25').getTime(), 'left 越界 start');
        eq(4, t.endDate.getTime(), d('2026-10-26').getTime(), 'left 越界 end 钳制为 start+1d');
    }

    // right 收缩到 start 当天 → 钳制为 start+1d
    {
        const pp = parsePlan(SAMPLE);
        const t = pp.tasks[2]; // 11-06 → 11-25
        clampAndValidateDates(t, cloneDate(t.startDate), d('2026-11-01'));
        eq(4, t.endDate.getTime(), d('2026-11-07').getTime(), 'right 收缩钳制');
    }

    // 拖拽后重渲染仍是合法 SVG
    {
        const pp = parsePlan(SAMPLE);
        const t = pp.tasks[3];
        const s = cloneDate(t.startDate);
        s.setDate(s.getDate() + 4);
        const e = cloneDate(t.endDate);
        e.setDate(e.getDate() + 4);
        clampAndValidateDates(t, s, e);
        const r2 = renderGanttSvg(pp);
        check(4, r2.svg.startsWith('<svg'), '拖拽后重渲染合法');
        check(4, r2.coords.has('开发迭代 2'), '拖拽后 coords 完整');
    }
}

// ========== Round 5：写回逻辑 ==========
function round5() {
    const fileContent = [
        '# 笔记',
        '',
        '```project',
        'name: 不应被动',
        'tasks: []',
        '```',
        '',
        '前文说明。',
        '',
        '```thinkcell',
        SAMPLE,
        '```',
        '',
        '后文说明。',
    ].join('\n');

    // 1) 正则恰好匹配一个块，且匹配内容包含首尾
    const matches = fileContent.match(new RegExp(THINKCELL_BLOCK_RE.source, 'g')) || [];
    eq(5, matches.length, 1, '源文件中 thinkcell 块数量');
    check(5, matches[0].startsWith('```thinkcell'), '匹配从 ```thinkcell 开始');
    check(5, matches[0].endsWith('```'), '匹配到收尾 ```');

    // 2) 模拟拖拽：开发迭代 2 end +2 天，序列化并替换
    const p = parsePlan(SAMPLE);
    const t2 = p.tasks[3];
    const s = cloneDate(t2.startDate);
    const e = cloneDate(t2.endDate);
    e.setDate(e.getDate() + 2);
    clampAndValidateDates(t2, s, e);

    const newBlock = '```thinkcell\n' + serializePlan(p) + '\n```';
    const updated = fileContent.replace(THINKCELL_BLOCK_RE, newBlock);

    check(5, updated.includes('name: 不应被动'), 'project 块未被破坏');
    check(5, updated.includes('前文说明。') && updated.includes('后文说明。'), '前后文完整');
    check(5, (updated.match(/```thinkcell/g) || []).length === 1, '替换后仍只有一个 thinkcell 块');
    check(5, updated !== fileContent, '内容确实发生变化');

    // 3) 写回后的文件重新解析 → 日期已持久化
    const blockInFile = updated.match(THINKCELL_BLOCK_RE)![0];
    const inner = blockInFile.replace(/^```thinkcell\s*\n/, '').replace(/```\s*$/, '');
    const p2 = parsePlan(inner);
    eq(5, p2.tasks[3].endDate.getTime(), d('2026-12-17').getTime(), '开发迭代 2 end 已写回为 12-17');
    eq(5, p2.tasks[3].startDate.getTime(), d('2026-11-26').getTime(), '开发迭代 2 start 不变');

    // 4) 写回后再序列化 = 稳定（拖两次同一段不会越改越乱）
    eq(5, serializePlan(p2), serializePlan(p), '写回内容幂等');

    // 5) 无 thinkcell 块的文件 → replace 无操作
    const noBlock = fileContent.replace(/```thinkcell\s*\n[\s\S]*?```/, '');
    check(5, noBlock.includes('# 笔记'), '无块文件替换不崩溃');
}

// ========== 执行 ==========
const rounds: Array<[number, string, () => void]> = [
    [1, 'YAML 解析正确性', round1],
    [2, '序列化往返幂等', round2],
    [3, '渲染产物完整性', round3],
    [4, '拖拽数学（平移/钳制）', round4],
    [5, '写回源文件逻辑', round5],
];

console.log('ThinkCell Planner 测试 — 5 轮\n' + '='.repeat(46));
for (const [n, name, fn] of rounds) {
    const before = total;
    try {
        fn();
    } catch (e) {
        (roundFails[n] ??= []).push(`异常: ${e instanceof Error ? e.message : String(e)}`);
    }
    const failed = (roundFails[n] || []).length;
    const passed = total - before - failed;
    console.log(`Round ${n} ${failed === 0 ? '✓ PASS' : '✗ FAIL'}  ${name}  (${passed} 通过 / ${failed} 失败)`);
    for (const f of roundFails[n] || []) console.log(`   ✗ ${f}`);
}
console.log('='.repeat(46));
const failedTotal = Object.values(roundFails).reduce((a, b) => a + b.length, 0);
console.log(`总计: ${total - failedTotal}/${total} 断言通过`);
if (failedTotal > 0) {
    process.exit(1);
}
console.log('全部 5 轮通过 ✔');
