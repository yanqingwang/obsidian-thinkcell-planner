import { Notice, Plugin } from 'obsidian';
import { parsePlan } from './parser';
import { renderGanttSvg } from './renderer';

export default class ThinkCellPlannerPlugin extends Plugin {
    async onload() {
        this.registerMarkdownCodeBlockProcessor('thinkcell', (source, el) => {
            this.renderBlock(source, el);
        });
    }

    private renderBlock(source: string, container: HTMLElement) {
        container.empty();
        container.addClass('thinkcell-container');

        let svg: string;
        try {
            const plan = parsePlan(source);
            svg = renderGanttSvg(plan);
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
        // 使用 DOMParser 安全地插入 SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const svgEl = doc.documentElement;
        if (svgEl.nodeName === 'svg') {
            canvas.appendChild(canvas.ownerDocument.importNode(svgEl, true));
        } else {
            const errDiv = container.createEl('div', { cls: 'thinkcell-error' });
            errDiv.setText('Failed to render SVG.');
        }
    }

    private downloadSvg(svg: string) {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thinkcell-plan-${Date.now()}.svg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        new Notice('SVG exported. Insert into PowerPoint, right-click → "Convert to Shape" to edit.');
    }
}
