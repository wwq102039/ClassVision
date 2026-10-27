import { memo } from 'react'
import { Button, Result } from 'antd'
import type { ReactNode } from 'react'
import type { EmptyStateProps } from '../../theme/types'
import styles from './EmptyState.module.css'

/**
 * 类型对应的图标
 */
const typeIcons: Record<NonNullable<EmptyStateProps['type']>, string> = {
  data: '📦',
  search: '🔍',
  error: '⚠️',
  permission: '🔒',
}

/**
 * 类型对应的默认描述
 */
const typeDescriptions: Record<NonNullable<EmptyStateProps['type']>, string> = {
  data: '暂无相关数据',
  search: '未找到匹配结果',
  error: '加载失败，请稍后重试',
  permission: '暂无权限访问此内容',
}

/**
 * EmptyState 空状态组件
 * 
 * 职责：展示空数据、错误、权限等状态
 * 
 * 视觉特性：
 * - 插画/图标区域
 * - 标题 + 描述文案
 * - 可选操作按钮
 * - 动画效果（fadeIn）
 */
function EmptyState({
  type = 'data',
  title,
  description,
  actions,
  icon,
  illustration,
  className,
}: EmptyStateProps) {
  const rootClass = `${styles.emptyState} ${className || ''}`.trim()
  
  const defaultIcon = typeIcons[type]
  const defaultDescription = typeDescriptions[type]

  // 渲染操作按钮
  const renderActions = () => {
    if (!actions || actions.length === 0) return null
    
    return (
      <div className={styles.actions}>
        {actions.map((action, index) => (
          <Button
            key={index}
            type={action.type || 'primary'}
            onClick={action.onClick}
            size="middle"
          >
            {action.label}
          </Button>
        ))}
      </div>
    )
  }

  // 使用 AntD Result 组件作为基础
  return (
    <div className={rootClass}>
      <Result
        className={styles.result}
        icon={
          illustration ? (
            <img 
              src={illustration} 
              alt={title} 
              className={styles.illustration}
            />
          ) : icon ? (
            <span className={styles.customIcon}>{icon}</span>
          ) : (
            <span className={styles.defaultIcon}>{defaultIcon}</span>
          )
        }
        title={
          <div className={styles.titleWrapper}>
            <h3 className={styles.title}>{title}</h3>
          </div>
        }
        subTitle={
          <p className={styles.description}>
            {description || defaultDescription}
          </p>
        }
        extra={renderActions()}
      />
    </div>
  )
}

export default memo(EmptyState)