import { memo } from 'react'
import { Card, Skeleton, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { StatCardProps } from '../../theme/types'
import styles from './StatCard.module.css'

const { Text, Title } = Typography

/**
 * 数值颜色映射
 */
const valueColorMap: Record<NonNullable<StatCardProps['color']>, string> = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
}

/**
 * 图标背景色映射
 */
const iconBgColorMap: Record<NonNullable<StatCardProps['color']>, string> = {
  primary: 'var(--color-primary-bg)',
  success: 'var(--color-success-bg)',
  warning: 'var(--color-warning-bg)',
  error: 'var(--color-error-bg)',
  info: 'var(--color-info-bg)',
}

/**
 * 趋势图标
 */
const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
  if (trend === 'up') {
    return (
      <span className={styles.trendIcon} style={{ color: 'var(--color-success)' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
        </svg>
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span className={styles.trendIcon} style={{ color: 'var(--color-error)' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
        </svg>
      </span>
    )
  }
  return (
    <span className={styles.trendIcon} style={{ color: 'var(--color-info)' }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 2V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/**
 * StatCard 统计卡片组件
 * 
 * 职责：展示统计数据，支持图标、数字、趋势
 * 
 * 视觉特性：
 * - 图标背景：品牌色 10% 透明度
 * - 数字字号：24-28px，字重 600-700
 * - 悬浮效果：阴影 + 位移 2px
 * - 过渡动画：150ms ease
 */
function StatCard({
  title,
  value,
  icon,
  color = 'primary',
  showTrend = false,
  trend = 'stable',
  onClick,
  loading = false,
  className,
}: StatCardProps) {
  const cardClass = `${styles.statCard} ${onClick ? styles.clickable : ''} ${className || ''}`.trim()
  
  const handleCardClick = () => {
    if (!loading && onClick) {
      onClick()
    }
  }

  return (
    <Card
      className={cardClass}
      onClick={handleCardClick}
      bordered={false}
      bodyStyle={{ padding: 'var(--spacing-lg)' }}
    >
      <div className={styles.content}>
        {/* 左侧图标区域 */}
        {icon && (
          <div 
            className={styles.iconWrapper}
            style={{ backgroundColor: iconBgColorMap[color] }}
          >
            {icon}
          </div>
        )}
        
        {/* 右侧文本区域 */}
        <div className={styles.textWrapper}>
          {/* 标题 */}
          <Text className={styles.title} type="secondary">
            {title}
          </Text>
          
          {/* 数值 */}
          <div className={styles.valueWrapper}>
            {loading ? (
              <Skeleton.Input
                active
                size="small"
                className={styles.skeleton}
              />
            ) : (
              <Title
                className={styles.value}
                level={3}
                style={{ color: valueColorMap[color] }}
              >
                {value}
              </Title>
            )}
            
            {/* 趋势指示 */}
            {showTrend && !loading && (
              <TrendIcon trend={trend} />
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default memo(StatCard)