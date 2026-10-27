import { memo } from 'react'
import { Tag } from 'antd'
import type { StatusTagProps } from '../../theme/types'
import styles from './StatusTag.module.css'

/**
 * 默认状态映射
 */
const defaultStatusMap: Record<string, { text: string; color: string }> = {
  success: { text: '成功', color: 'success' },
  warning: { text: '警告', color: 'warning' },
  error: { text: '错误', color: 'error' },
  info: { text: '信息', color: 'info' },
  processing: { text: '处理中', color: 'processing' },
  default: { text: '默认', color: 'default' },
}

/**
 * 颜色映射
 */
const colorMap: Record<string, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
  processing: 'var(--color-primary)',
  default: 'rgba(0, 0, 0, 0.45)',
}

/**
 * 背景色映射
 */
const bgColorMap: Record<string, string> = {
  success: 'var(--color-success-bg)',
  warning: 'var(--color-warning-bg)',
  error: 'var(--color-error-bg)',
  info: 'var(--color-info-bg)',
  processing: 'var(--color-primary-bg)',
  default: 'rgba(0, 0, 0, 0.04)',
}

/**
 * StatusTag 状态标签组件
 * 
 * 职责：展示语义化状态
 * 
 * 视觉特性：
 * - 支持自定义状态映射
 * - 支持圆点指示器
 * - 支持多种尺寸
 * - 语义化颜色（success/warning/error/info）
 */
function StatusTag({
  status,
  statusMap,
  dot = false,
  size = 'middle',
  className,
}: StatusTagProps) {
  const rootClass = `${styles.statusTag} ${styles[size]} ${dot ? styles.withDot : ''} ${className || ''}`.trim()

  // 合并默认状态映射和自定义状态映射
  const mergedStatusMap = statusMap 
    ? { ...defaultStatusMap, ...statusMap }
    : defaultStatusMap

  // 获取状态配置
  const statusConfig = mergedStatusMap[status] || mergedStatusMap.default
  const tagColor = colorMap[statusConfig.color] || colorMap.default
  const tagBgColor = bgColorMap[statusConfig.color] || bgColorMap.default

  return (
    <Tag
      className={rootClass}
      color={tagColor}
      style={{ 
        backgroundColor: tagBgColor,
        borderColor: 'transparent',
      }}
    >
      {/* 圆点指示器 */}
      {dot && (
        <span 
          className={styles.dot}
          style={{ backgroundColor: tagColor }}
        />
      )}
      
      {/* 状态文本 */}
      <span className={styles.text}>{statusConfig.text}</span>
    </Tag>
  )
}

export default memo(StatusTag)