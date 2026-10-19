/**
 * Think-Cell Planner 类型定义
 */

export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'delayed';

export interface Task {
    /** 任务名称 */
    name: string;
    /** 开始日期 YYYY-MM-DD */
    start: string;
    /** 结束日期 YYYY-MM-DD（里程碑可省略，用 start） */
    end?: string;
    /** 里程碑标记 */
    milestone?: boolean;
    /** 状态 */
    status?: TaskStatus;
    /** 负责人 */
    owner?: string;
    /** 完成进度 0-100 */
    progress?: number;
    /** 所属泳道/分组 */
    lane?: string;
    /** 自定义颜色（覆盖状态颜色） */
    color?: string;
    /** 依赖的任务名称（绘制箭头） */
    dependsOn?: string[];
}

export interface ProjectPlan {
    /** 图表标题 */
    title?: string;
    /** 项目整体开始日期（可选，默认自动计算） */
    start?: string;
    /** 项目整体结束日期（可选，默认自动计算） */
    end?: string;
    /** 是否显示今日线，默认 true */
    showToday?: boolean;
    /** 任务列表 */
    tasks: Task[];
}

export interface ParsedTask extends Task {
    startDate: Date;
    endDate: Date;
    rowIndex: number;
}

export interface ParsedPlan {
    title: string;
    startDate: Date;
    endDate: Date;
    showToday: boolean;
    tasks: ParsedTask[];
    lanes: string[];
}

/** 状态对应颜色（Think-Cell 风格） */
export const STATUS_COLORS: Record<TaskStatus, string> = {
    'todo': '#A6A6A6',
    'in-progress': '#4472C4',
    'done': '#70AD47',
    'delayed': '#ED7D31',
};

export const MILESTONE_COLOR = '#C00000';
