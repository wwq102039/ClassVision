import { memo } from 'react'
import { Breadcrumb, Button, Skeleton, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { PageHeaderProps } from '../../theme/types'
import styles from './PageHeader.module.css'

const { Title } = Typography

/**
 * PageHeader 页面标题组件
 * 
 * 职责：统一页面标题层级
 * 
 * 视觉特性：
 * - H1 标题：24-28px，字重 600-700
 * - 副标题：14-16px，辅助色
 * - 可选面包屑导航
 * - 可选返回按钮
 * - 可选右侧操作区
 * - 加载状态
 */
function PageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  breadcrumbs,
  actions,
  loading = false,
  className,
}: PageHeaderProps) {
  const rootClass = `${styles.pageHeader} ${className || ''}`.trim()

  // 处理返回按钮点击
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      window.history.back()
    }
  }

  return (
    <div className={rootClass}>
      {/* 顶部区域：返回按钮 + 面包屑 + 操作区 */}
      <div className={styles.topRow}>
        {/* 左侧区域 */}
        <div className={styles.leftArea}>
          {/* 返回按钮 */}
          {showBack && (
            <Button
              type="text"
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 2L4 8L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              }
              onClick={handleBack}
              className={styles.backButton}
            >
              返回
            </Button>
          )}

          {/* 面包屑导航 */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumb className={styles.breadcrumb}>
              {breadcrumbs.map((item, index) => (
                <Breadcrumb.Item key={index}>
                  {item.path ? (
                    <a href={`#${item.path}`}>{item.label}</a>
                  ) : (
                    item.label
                  )}
                </Breadcrumb.Item>
              ))}
            </Breadcrumb>
          )}
        </div>

        {/* 右侧操作区 */}
        {actions && (
          <div className={styles.actions}>
            {actions}
          </div>
        )}
      </div>

      {/* 标题区域 */}
      <div className={styles.titleRow}>
        {loading ? (
          <div className={styles.titleSkeleton}>
            <Skeleton.Input active size="large" className={styles.titleSkeletonInput} />
            <Skeleton.Input active size="small" className={styles.subtitleSkeletonInput} />
          </div>
        ) : (
          <>
            <Title className={styles.title} level={1}>
              {title}
            </Title>
            {subtitle && (
              <p className={styles.subtitle}>
                {subtitle}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default memo(PageHeader)