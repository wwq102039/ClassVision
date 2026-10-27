/**
 * 智课眼（ClassVision）样式工具函数
 * 
 * 本文件提供样式生成相关的工具函数，用于动态生成
 * 卡片悬浮样式、间距、圆角等。
 */

import { themeTokens } from '../theme/theme'

/**
 * 获取卡片悬浮样式
 * 
 * @returns 包含悬浮样式的对象
 * 
 * @example
 * const hoverStyle = getCardHoverStyle()
 * // { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)', transform: 'translateY(-2px)' }
 */
export function getCardHoverStyle(): React.CSSProperties {
  return {
    boxShadow: themeTokens.shadow.hover,
    transform: 'translateY(-2px)',
  }
}

/**
 * 获取间距值
 * 
 * @param spacing - 间距名称
 * @returns 间距值（px）
 * 
 * @example
 * getSpacing('md')  // 16
 * getSpacing('lg')  // 24
 */
export function getSpacing(
  spacing: keyof typeof themeTokens.spacing
): number {
  return themeTokens.spacing[spacing]
}

/**
 * 获取圆角值
 * 
 * @param radius - 圆角名称
 * @returns 圆角值（px）
 * 
 * @example
 * getRadius('card')    // 8
 * getRadius('button')  // 6
 */
export function getRadius(
  radius: keyof typeof themeTokens.radius
): number {
  return themeTokens.radius[radius]
}

/**
 * 获取阴影样式
 * 
 * @param shadow - 阴影名称
 * @returns 阴影样式字符串
 * 
 * @example
 * getShadow('card')   // '0 2px 8px rgba(0, 0, 0, 0.08)'
 * getShadow('hover')  // '0 4px 16px rgba(0, 0, 0, 0.12)'
 */
export function getShadow(
  shadow: keyof typeof themeTokens.shadow
): string {
  return themeTokens.shadow[shadow]
}

/**
 * 获取动画时长
 * 
 * @param animation - 动画名称
 * @returns 动画时长（ms）
 * 
 * @example
 * getAnimationDuration('hover')    // 150
 * getAnimationDuration('enter')    // 300
 */
export function getAnimationDuration(
  animation: 'hover' | 'enter' | 'loading'
): number {
  switch (animation) {
    case 'hover':
      return themeTokens.animation.hoverDuration
    case 'enter':
      return themeTokens.animation.enterDuration
    case 'loading':
      return themeTokens.animation.loadingDuration
    default:
      return 150
  }
}

/**
 * 获取悬浮过渡样式
 * 
 * @param property - CSS 属性
 * @returns 过渡样式字符串
 * 
 * @example
 * getHoverTransition('box-shadow')  // 'box-shadow 150ms ease-in-out'
 */
export function getHoverTransition(
  property: string
): string {
  return `${property} ${themeTokens.animation.hoverDuration}ms ${themeTokens.animation.hoverEasing}`
}

/**
 * 获取所有悬浮过渡样式
 * 
 * @param properties - CSS 属性数组
 * @returns 过渡样式字符串
 * 
 * @example
 * getAllHoverTransitions(['box-shadow', 'transform'])
 * // 'box-shadow 150ms ease-in-out, transform 150ms ease-in-out'
 */
export function getAllHoverTransitions(
  properties: string[]
): string {
  return properties
    .map(prop => getHoverTransition(prop))
    .join(', ')
}

/**
 * 生成内联样式对象（用于动态样式）
 * 
 * @param styleName - 样式名称
 * @returns 内联样式对象
 * 
 * @example
 * generateInlineStyle('card-hover')
 * // { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)', transform: 'translateY(-2px)' }
 */
export function generateInlineStyle(
  styleName: 'card-hover' | 'card-shadow' | 'card-lift'
): React.CSSProperties {
  switch (styleName) {
    case 'card-hover':
      return {
        boxShadow: themeTokens.shadow.hover,
        transform: 'translateY(-2px)',
      }
    case 'card-shadow':
      return {
        boxShadow: themeTokens.shadow.hover,
      }
    case 'card-lift':
      return {
        transform: 'translateY(-2px)',
      }
    default:
      return {}
  }
}

/**
 * 获取字体样式
 * 
 * @param level - 字体层级
 * @returns 字体样式对象
 * 
 * @example
 * getFontStyle('h1')  // { fontSize: 28, fontWeight: 600, lineHeight: 1.4 }
 */
export function getFontStyle(
  level: keyof typeof themeTokens.typography
): React.CSSProperties {
  const font = themeTokens.typography[level]
  return {
    fontSize: `${font.fontSize}px`,
    fontWeight: font.fontWeight,
    lineHeight: font.lineHeight,
  }
}

/**
 * 生成 CSS 变量字符串
 * 
 * @returns CSS 变量字符串
 * 
 * @example
 * const cssVars = generateCssVariables()
 * // ':root { --color-primary: #1890ff; ... }'
 */
export function generateCssVariables(): string {
  const { brand, semantic, typography, spacing, radius, shadow, animation } = themeTokens
  
  return `
:root {
  /* 品牌色 */
  --color-primary: ${brand.primary};
  --color-primary-bg: ${brand.primaryBg};
  --color-primary-hover: ${brand.primaryHover};
  --color-primary-active: ${brand.primaryActive};
  
  /* 语义色 */
  --color-success: ${semantic.success};
  --color-success-bg: ${semantic.successBg};
  --color-warning: ${semantic.warning};
  --color-warning-bg: ${semantic.warningBg};
  --color-error: ${semantic.error};
  --color-error-bg: ${semantic.errorBg};
  --color-info: ${semantic.info};
  --color-info-bg: ${semantic.infoBg};
  
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