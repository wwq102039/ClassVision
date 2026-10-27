/**
 * 智课眼（ClassVision）设计令牌配置
 * 
 * 本文档定义了完整的设计令牌值，集中管理品牌色、字体、间距、圆角、阴影等全局样式变量。
 * 设计理念：青蓝色（#1890ff）为主色调，体现教育科技专业感、智能感。
 */

import { theme } from 'antd'
import type {
  ThemeTokens,
  BrandColors,
  SemanticColors,
  TypographyTokens,
  SpacingTokens,
  RadiusTokens,
  ShadowTokens,
  AnimationTokens,
  StatusColorConfig,
  AttendanceRateConfig,
} from './types'

// ============================================================
// 品牌色板定义
// ============================================================

/** 品牌色板 - 教育科技、智能、专业 */
export const brandColors: BrandColors = {
  primary: '#1890ff',        // AntD 蓝 - 专业、科技
  primaryBg: 'rgba(24, 144, 255, 0.1)',
  primaryHover: '#40a9ff',
  primaryActive: '#096dd9',
}

// ============================================================
// 语义化色板定义
// ============================================================

/** 语义化色板 - 用于状态指示 */
export const semanticColors: SemanticColors = {
  // 成功色 - 绿色，用于正常/成功状态
  success: '#52c41a',
  successBg: 'rgba(82, 196, 26, 0.1)',
  // 警告色 - 橙黄，用于迟到/警告状态
  warning: '#faad14',
  warningBg: 'rgba(250, 173, 20, 0.1)',
  // 错误色 - 红色，用于缺勤/错误状态
  error: '#ff4d4f',
  errorBg: 'rgba(255, 77, 79, 0.1)',
  // 信息色 - 蓝色，用于信息提示
  info: '#1890ff',
  infoBg: 'rgba(24, 144, 255, 0.1)',
}

// ============================================================
// 字体层级定义
// ============================================================

/** 字体层级 */
export const typography: TypographyTokens = {
  h1: { fontSize: 28, fontWeight: 600, lineHeight: 1.4 },   // 页面标题
  h2: { fontSize: 22, fontWeight: 600, lineHeight: 1.4 },   // 副标题
  h3: { fontSize: 16, fontWeight: 500, lineHeight: 1.5 },   // 卡片标题
  body: { fontSize: 14, fontWeight: 400, lineHeight: 1.6 }, // 正文
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.5 }, // 辅助文字
}

// ============================================================
// 间距阶梯定义
// ============================================================

/** 间距阶梯 */
export const spacing: SpacingTokens = {
  xs: 4,    // 紧凑间距
  sm: 8,    // 小间距
  md: 16,   // 中等间距
  lg: 24,   // 大间距
  xl: 32,   // 较大间距
  xxl: 48,  // 大区块间距
}

// ============================================================
// 圆角规范定义
// ============================================================

/** 圆角规范 */
export const radius: RadiusTokens = {
  button: 6,      // 按钮圆角
  card: 8,        // 卡片圆角
  input: 6,       // 输入框圆角
  dropdown: 6,    // 下拉框圆角
  badge: 999,     // 徽章/标签圆角（圆形）
}

// ============================================================
// 阴影规范定义
// ============================================================

/** 阴影规范 */
export const shadow: ShadowTokens = {
  card: '0 2px 8px rgba(0, 0, 0, 0.08)',       // 卡片默认阴影
  hover: '0 4px 16px rgba(0, 0, 0, 0.12)',     // 悬浮阴影
  modal: '0 8px 24px rgba(0, 0, 0, 0.15)',     // 模态框阴影
}

// ============================================================
// 动画规范定义
// ============================================================

/** 动画规范 */
export const animation: AnimationTokens = {
  hoverDuration: 150,    // 悬停过渡时长
  hoverEasing: 'ease-in-out',  // 悬停缓动函数
  enterDuration: 300,    // 入场动画时长
  loadingDuration: 800,  // 加载动画时长
}

// ============================================================
// 完整设计令牌
// ============================================================

/** 完整设计令牌 */
export const themeTokens: ThemeTokens = {
  brand: brandColors,
  semantic: semanticColors,
  typography,
  spacing,
  radius,
  shadow,
  animation,
}

// ============================================================
// 业务状态颜色配置
// ============================================================

/** 出勤状态颜色映射 */
export const attendanceStatusColors: Record<string, StatusColorConfig> = {
  present: { color: semanticColors.success, bgColor: semanticColors.successBg },
  late: { color: semanticColors.warning, bgColor: semanticColors.warningBg },
  absent: { color: semanticColors.error, bgColor: semanticColors.errorBg },
  unknown: { color: semanticColors.info, bgColor: semanticColors.infoBg },
}

/** 出勤率阈值颜色配置 */
export const attendanceRateConfig: AttendanceRateConfig = {
  // 正常 - 90% 以上
  normal: {
    threshold: 90,
    color: semanticColors.success,
    bgColor: semanticColors.successBg,
  },
  // 迟到 - 70%-90%
  late: {
    threshold: 70,
    color: semanticColors.warning,
    bgColor: semanticColors.warningBg,
  },
  // 缺勤 - 70% 以下
  absent: {
    threshold: 0,
    color: semanticColors.error,
    bgColor: semanticColors.errorBg,
  },
}

/** 获取出勤率对应颜色配置 */
export function getAttendanceRateColor(rate: number): StatusColorConfig {
  if (rate >= attendanceRateConfig.normal.threshold) {
    return attendanceRateConfig.normal
  }
  if (rate >= attendanceRateConfig.late.threshold) {
    return attendanceRateConfig.late
  }
  return attendanceRateConfig.absent
}

// ============================================================
// AntD Theme 配置生成
// ============================================================

/** AntD 主题 Token 配置 */
export function getAntdTheme() {
  return {
    algorithm: theme.darkAlgorithm,
    token: {
      colorBgBase: '#071321',
      colorBgContainer: '#0c2035',
      colorBgElevated: '#102b43',
      colorTextBase: '#e0f2ff',
      // 品牌色
      colorPrimary: brandColors.primary,
      colorPrimaryBg: brandColors.primaryBg,
      colorPrimaryHover: brandColors.primaryHover,
      colorPrimaryActive: brandColors.primaryActive,
      
      // 圆角
      borderRadius: radius.button,
      borderRadiusLG: radius.card,
      
      // 字体
      fontSize: 14,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    },
    components: {
      // Button 组件配置
      Button: {
        borderRadius: radius.button,
        controlHeight: 36,
      },
      // Input 组件配置
      Input: {
        borderRadius: radius.input,
        controlHeight: 36,
      },
      // Table 组件配置
      Table: {
        borderRadius: radius.card,
        headerBg: '#102b43',
        rowHoverBg: '#14334d',
      },
      // Card 组件配置
      Card: {
        borderRadius: radius.card,
        headerFontSize: 16,
      },
      // Menu 组件配置
      Menu: {
        itemBg: 'transparent',
        itemHoverBg: 'rgba(24, 144, 255, 0.08)',
        itemSelectedBg: 'rgba(24, 144, 255, 0.1)',
        itemSelectedColor: brandColors.primary,
      },
      // Modal 组件配置
      Modal: {
        borderRadius: radius.card,
        titleFontSize: 16,
      },
      // Tooltip 组件配置
      Tooltip: {
        borderRadius: radius.input,
      },
    },
  }
}

// ============================================================
// CSS 变量导出（供 Less 使用）
// ============================================================

/** 获取 CSS 变量字符串 */
export function getCssVariables(): string {
  return `
:root {
  /* 品牌色 */
  --color-primary: ${brandColors.primary};
  --color-primary-bg: ${brandColors.primaryBg};
  --color-primary-hover: ${brandColors.primaryHover};
  --color-primary-active: ${brandColors.primaryActive};
  
  /* 语义色 */
  --color-success: ${semanticColors.success};
  --color-success-bg: ${semanticColors.successBg};
  --color-warning: ${semanticColors.warning};
  --color-warning-bg: ${semanticColors.warningBg};
  --color-error: ${semanticColors.error};
  --color-error-bg: ${semanticColors.errorBg};
  --color-info: ${semanticColors.info};
  --color-info-bg: ${semanticColors.infoBg};
  
  /* 字体大小 */
  --font-h1: ${typography.h1.fontSize}px;
  --font-h2: ${typography.h2.fontSize}px;
  --font-h3: ${typography.h3.fontSize}px;
  --font-body: ${typography.body.fontSize}px;
  --font-caption: ${typography.caption.fontSize}px;
  
  /* 间距 */
  --spacing-xs: ${spacing.xs}px;
  --spacing-sm: ${spacing.sm}px;
  --spacing-md: ${spacing.md}px;
  --spacing-lg: ${spacing.lg}px;
  --spacing-xl: ${spacing.xl}px;
  --spacing-xxl: ${spacing.xxl}px;
  
  /* 圆角 */
  --radius-button: ${radius.button}px;
  --radius-card: ${radius.card}px;
  --radius-input: ${radius.input}px;
  --radius-dropdown: ${radius.dropdown}px;
  --radius-badge: ${radius.badge}px;
  
  /* 阴影 */
  --shadow-card: ${shadow.card};
  --shadow-hover: ${shadow.hover};
  --shadow-modal: ${shadow.modal};
  
  /* 动画 */
  --hover-duration: ${animation.hoverDuration}ms;
  --hover-easing: ${animation.hoverEasing};
  --enter-duration: ${animation.enterDuration}ms;
}
`
}

export default themeTokens
