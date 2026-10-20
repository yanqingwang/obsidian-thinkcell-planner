import { Notice, Plugin, TFile } from 'obsidian';
import { parsePlan } from './parser';
import { renderGanttSvg, CANVAS_WIDTH } from './renderer';
import { pixelToDayOffset, cloneDate, clampAndValidateDates } from './geometry';
import { serializePlan, THINKCELL_BLOCK_RE } from './serializer';
import { ParsedPlan, ParsedTask } from './types';

export default class ThinkCellPlannerPlugin extends Plugin {
    async onload() {
        this.registerMarkdownCodeBlockProcessor('thinkcell', (source, el, ctx) => {
            this.renderBlock(source, el, ctx.sourcePath);
        });
    }

    private renderBlock(source: string, container: HTMLElement, sourcePath: string) {
        container.empty();
        container.addClass('thinkcell-container');

        let plan: ParsedPlan;
        let svg: string;
        try {
            plan = parsePlan(source);
            const r = renderGanttSvg(plan);
            svg = r.svg;
        } catch (e) {
            const errDiv = container.createEl('div', { cls: 'thinkcell-error' });
            errDiv.setText(`ThinkCell Planner Error:\n${e instanceof Error ? e.message : String(e)}`);
            return;
        }

        // 工具栏
        const toolbar = container.createEl('div', { cls: 'thinkcell-toolbar' });

        const copyBtn = toolbar.createEl('button', { cls: 'thinkcell-btn', text: 'Copy SVG' });
        copyBtn.addEventListener('click', () => {
            void navigator.clipboard.writeText(svg).then(() => {
                new Notice('SVG copied. Paste into a .svg file, then insert into PowerPoint and "Convert to Shape" to edit.');
            });
        });

        const exportBtn = toolbar.createEl('button', { cls: 'thinkcell-btn', text: 'Export SVG' });
        exportBtn.addEventListener('click', () => {
            this.downloadSvg(svg);
        });

        // 渲染区
        const canvas = container.createEl('div', { cls: 'thinkcell-canvas' });
        this.insertSvg(canvas, svg);

        // === 交互拖拽（事件委托在 canvas 上，rerender 后依然有效） ===
        this.bindDrag(canvas, plan, sourcePath);
    }

    private insertSvg(canvas: HTMLElement, svg: string): SVGSVGElement {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const svgEl = doc.documentElement;
        canvas.appendChild(canvas.ownerDocument.importNode(svgEl, true));
        return canvas.querySelector('svg')!;
    }

    /** 在交互模式下重绘 SVG */
    private rerender(canvas: HTMLElement, plan: ParsedPlan): void {
        const r = renderGanttSvg(plan);
        const old = canvas.querySelector('svg');
        if (old) old.remove();
        this.insertSvg(canvas, r.svg);
    }

    /** 把 plan 写回源文件里的 ```thinkcell 代码块 */
    private async persistToFile(sourcePath: string, plan: ParsedPlan) {
        try {
            const file = this.app.vault.getAbstractFileByPath(sourcePath);
            if (!(file instanceof TFile)) return;
            const content = await this.app.vault.read(file);
            const newBlock = '```thinkcell\n' + serializePlan(plan) + '\n```';
            const updated = content.replace(THINKCELL_BLOCK_RE, newBlock);
            if (updated !== content) {
                await this.app.vault.modify(file, updated);
            }
        } catch (e) {
            console.error('ThinkCell: persist failed', e);
        }
    }

    private bindDrag(canvas: HTMLElement, plan: ParsedPlan, sourcePath: string) {
        let drag: {
            task: ParsedTask;
            mode: 'body' | 'left' | 'right' | 'milestone';
            startX: number;
            origStart: Date;
            origEnd: Date;
        } | null = null;
        let dirty = false;
        let lastDayOffset = 0;

        // 每次都取当前 SVG（rerender 会替换节点）
        const getSvgPoint = (ev: MouseEvent): number => {
            const cur = canvas.querySelector('svg');
            if (!cur) return 0;
            const rect = cur.getBoundingClientRect();
            const ratio = CANVAS_WIDTH / rect.width;
            return (ev.clientX - rect.left) * ratio;
        };

        /** 拖拽中锁定鼠标指针样式（用 CSS class，不写行内样式） */
        const setDragCursor = (mode: 'body' | 'left' | 'right' | 'milestone' | null) => {
            document.body.removeClass('thinkcell-dragging-move');
            document.body.removeClass('thinkcell-dragging-resize');
            if (mode === null) return;
            document.body.addClass(
                mode === 'left' || mode === 'right' ? 'thinkcell-dragging-resize' : 'thinkcell-dragging-move'
            );
        };

        const onMove = (ev: MouseEvent) => {
            if (!drag) return;
            const dx = getSvgPoint(ev) - drag.startX;
            const dayOffset = pixelToDayOffset(dx, plan);
            if (dayOffset === lastDayOffset) return;
            lastDayOffset = dayOffset;
            dirty = true;

            const t = drag.task;
            const s = cloneDate(drag.origStart);
            const e = cloneDate(drag.origEnd);

            if (drag.mode === 'body' || drag.mode === 'milestone') {
                s.setDate(s.getDate() + dayOffset);
                e.setDate(e.getDate() + dayOffset);
            } else if (drag.mode === 'left') {
                s.setDate(s.getDate() + dayOffset);
            } else if (drag.mode === 'right') {
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
                    new Notice('Task updated and saved');
                }
            }
            lastDayOffset = 0;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        // 事件委托：绑在 canvas（持久节点）而非 svg（会被替换）
        canvas.addEventListener('mousedown', (ev: MouseEvent) => {
            const target = ev.target as Element;
            const taskName = target.getAttribute ? target.getAttribute('data-tc-task') : null;
            if (!taskName) return;
            const task = plan.tasks.find((t) => t.name === taskName);
            if (!task) return;

            drag = {
                task,
                mode: target.getAttribute('data-tc-milestone')
                    ? 'milestone'
                    : (target.getAttribute('data-tc-drag') as 'body' | 'left' | 'right' || 'body'),
                startX: getSvgPoint(ev),
                origStart: cloneDate(task.startDate),
                origEnd: cloneDate(task.endDate),
            };
            dirty = false;
            lastDayOffset = 0;
            setDragCursor(drag.mode);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            ev.preventDefault();
        });
    }

    private downloadSvg(svg: string) {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.body.createEl('a', { href: url });
        a.download = `thinkcell-plan-${Date.now()}.svg`;
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        new Notice('SVG exported. Insert into PowerPoint, right-click → "Convert to Shape" to edit.');
    }
}
