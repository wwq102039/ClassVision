/**
 * 智课眼（ClassVision）设计令牌类型定义
 * 
 * 本文档定义了所有设计令牌的 TypeScript 接口，
 * 确保类型安全和 IDE 智能提示支持。
 */

// ============================================================
// 核心设计令牌接口
// ============================================================

/** 字体子项定义 */
interface FontToken {
  fontSize: number
  fontWeight: number
  lineHeight: number
}

/** 品牌色板 */
export interface BrandColors {
  /** 品牌主色 - #1890ff */
  primary: string
  /** 主色浅色背景 - rgba(24, 144, 255, 0.1) */
  primaryBg: string
  /** 主色悬停 - #40a9ff */
  primaryHover: string
  /** 主色激活 - #096dd9 */
  primaryActive: string
}

/** 语义化色板 */
export interface SemanticColors {
  /** 成功色 - 绿色，用于正常/成功状态 */
  success: string
  /** 成功色浅色背景 */
  successBg: string
  /** 警告色 - 橙黄，用于迟到/警告状态 */
  warning: string
  /** 警告色浅色背景 */
  warningBg: string
  /** 错误色 - 红色，用于缺勤/错误状态 */
  error: string
  /** 错误色浅色背景 */
  errorBg: string
  /** 信息色 - 蓝色，用于信息提示 */
  info: string
  /** 信息色浅色背景 */
  infoBg: string
}

/** 字体层级 */
export interface TypographyTokens {
  /** 页面标题 H1 - 24-28px */
  h1: FontToken
  /** 副标题 H2 - 18-22px */
  h2: FontToken
  /** 卡片标题 H3 - 16-18px */
  h3: FontToken
  /** 正文 - 14-16px */
  body: FontToken
  /** 辅助文字 - 12-14px */
  caption: FontToken
}

/** 间距阶梯 */
export interface SpacingTokens {
  /** 4px - 紧凑间距 */
  xs: number
  /** 8px - 小间距 */
  sm: number
  /** 16px - 中等间距 */
  md: number
  /** 24px - 大间距 */
  lg: number
  /** 32px - 较大间距 */
  xl: number
  /** 48px - 大区块间距 */
  xxl: number
}

/** 圆角规范 */
export interface RadiusTokens {
  /** 4-6px - 按钮圆角 */
  button: number
  /** 8-12px - 卡片圆角 */
  card: number
  /** 4-6px - 输入框圆角 */
  input: number
  /** 6-8px - 下拉框圆角 */
  dropdown: number
  /** 999px - 徽章/标签圆角 */
  badge: number
}

/** 阴影规范 */
export interface ShadowTokens {
  /** 卡片默认阴影 - 0 2px 8px rgba(0,0,0,0.08) */
  card: string
  /** 悬浮阴影 - 0 4px 16px rgba(0,0,0,0.12) */
  hover: string
  /** 模态框阴影 - 0 8px 24px rgba(0,0,0,0.15) */
  modal: string
}

/** 动画规范 */
export interface AnimationTokens {
  /** 悬停过渡时长 - 150ms */
  hoverDuration: number
  /** 悬停缓动函数 - ease-in-out */
  hoverEasing: string
  /** 入场动画时长 - 300ms */
  enterDuration: number
  /** 加载动画时长 - 800ms */
  loadingDuration: number
}

/** 完整设计令牌组合接口 */
export interface ThemeTokens {
  /** 品牌色板 */
  brand: BrandColors
  /** 语义化色板 */
  semantic: SemanticColors
  /** 字体层级 */
  typography: TypographyTokens
  /** 间距阶梯 */
  spacing: SpacingTokens
  /** 圆角规范 */
  radius: RadiusTokens
  /** 阴影规范 */
  shadow: ShadowTokens
  /** 动画规范 */
  animation: AnimationTokens
}

// ============================================================
// 组件 Props 接口
// ============================================================

import type { ReactNode } from 'react'

/** StatCard 统计卡片组件 Props */
export interface StatCardProps {
  /** 卡片标题 */
  title: string
  /** 数值 */
  value: number | string
  /** 图标 */
  icon?: ReactNode
  /** 数值颜色主题 */
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info'
  /** 是否显示趋势指示 */
  showTrend?: boolean
  /** 趋势方向 */
  trend?: 'up' | 'down' | 'stable'
  /** 点击事件 */
  onClick?: () => void
  /** 加载状态 */
  loading?: boolean
  /** 自定义样式类名 */
  className?: string
}

/** EmptyState 空状态组件 Props */
export interface EmptyStateProps {
  /** 空状态类型 */
  type?: 'data' | 'search' | 'error' | 'permission'
  /** 标题 */
  title: string
  /** 描述文案 */
  description?: string
  /** 操作按钮列表 */
  actions?: Array<{
    label: string
    onClick: () => void
    type?: 'primary' | 'default' | 'link'
  }>
  /** 自定义图标 */
  icon?: ReactNode
  /** 自定义插画 URL */
  illustration?: string
  /** 自定义样式类名 */
  className?: string
}

/** PageHeader 页面标题组件 Props */
export interface PageHeaderProps {
  /** 页面标题 */
  title: string
  /** 副标题 */
  subtitle?: string
  /** 是否显示返回按钮 */
  showBack?: boolean
  /** 返回按钮点击事件 */
  onBack?: () => void
  /** 面包屑导航数据 */
  breadcrumbs?: Array<{ label: string; path?: string }>
  /** 右侧操作区 */
  actions?: ReactNode
  /** 加载状态 */
  loading?: boolean
  /** 自定义样式类名 */
  className?: string
}

/** StatusTag 状态标签组件 Props */
export interface StatusTagProps {
  /** 状态值 */
  status: string
  /** 状态映射表 */
  statusMap?: Record<string, { text: string; color: string }>
  /** 是否显示圆点指示器 */
  dot?: boolean
  /** 标签尺寸 */
  size?: 'small' | 'middle' | 'large'
  /** 自定义样式类名 */
  className?: string
}

/** EnhancedTable 增强表格组件 Props */
export interface EnhancedTableProps<T = Record<string, unknown>> {
  /** 表格数据 */
  dataSource: T[]
  /** 列定义 */
  columns: Array<{
    title: string
    dataIndex: string
    key?: string
    render?: (value: unknown, record: T, index: number) => ReactNode
    width?: number | string
    align?: 'left' | 'center' | 'right'
  }>
  /** 行唯一标识字段 */
  rowKey?: string
  /** 是否显示序号 */
  showIndex?: boolean
  /** 分页配置 */
  pagination?: {
    current: number
    pageSize: number
    total: number
    onChange: (page: number, pageSize: number) => void
  }
  /** 空状态配置 */
  emptyState?: {
    type?: 'data' | 'search' | 'error' | 'permission'
    title: string
    description?: string
  }
  /** 行点击事件 */
  onRow?: (record: T) => void
  /** 自定义样式类名 */
  className?: string
}

/** 颜色工具函数返回类型 */
export interface StatusColorConfig {
  color: string
  bgColor: string
}

/** 出勤率阈值颜色配置 */
export interface AttendanceRateConfig {
  /** 正常阈值 - 90% 以上 */
  normal: { threshold: number; color: string; bgColor: string }
  /** 迟到阈值 - 70%-90% */
  late: { threshold: number; color: string; bgColor: string }
  /** 缺勤阈值 - 70% 以下 */
  absent: { threshold: number; color: string; bgColor: string }
}