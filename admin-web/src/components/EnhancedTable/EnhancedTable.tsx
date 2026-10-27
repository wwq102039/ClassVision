import { memo, useMemo } from 'react'
import { Table, ConfigProvider } from 'antd'
import type { EnhancedTableProps } from '../../theme/types'
import EmptyState from '../EmptyState/EmptyState'
import styles from './EnhancedTable.module.css'

/**
 * EnhancedTable 增强表格组件
 * 
 * 职责：增强 AntD Table 组件，优化表头样式、行高、悬停效果
 * 
 * 增强特性：
 * - 表头背景色：#fafafa
 * - 行高：48-56px
 * - 悬停行背景：品牌色 3% 透明度
 * - 空状态集成 EmptyState
 * - 支持可选序号列
 * - 支持分页配置
 */
function EnhancedTable<T>({
  dataSource,
  columns,
  rowKey = 'id',
  showIndex = false,
  pagination,
  emptyState,
  onRow,
  className,
}: EnhancedTableProps<T>) {
  const rootClass = `${styles.enhancedTable} ${className || ''}`.trim()

  // 构建列配置（如果显示序号）
  const mergedColumns = useMemo(() => {
    if (showIndex) {
      return [
        {
          title: '序号',
          dataIndex: '_index',
          key: '_index',
          width: 60,
          align: 'center' as const,
          render: (_: unknown, _record: T, index: number) => {
            if (pagination) {
              return (pagination.current - 1) * pagination.pageSize + index + 1
            }
            return index + 1
          },
        },
        ...columns,
      ]
    }
    return columns
  }, [columns, showIndex, pagination])

  // 构建空状态配置
  const emptyStateConfig = useMemo(() => {
    if (emptyState) {
      return {
        type: emptyState.type || 'data',
        title: emptyState.title,
        description: emptyState.description,
      }
    }
    return {
      type: 'data' as const,
      title: '暂无数据',
    }
  }, [emptyState])

  // 自定义空状态渲染
  const renderEmpty = () => (
    <EmptyState
      type={emptyStateConfig.type}
      title={emptyStateConfig.title}
      description={emptyStateConfig.description}
    />
  )

  // 行点击处理
  const onRowHandler = onRow
    ? (record: T) => ({
        onClick: () => onRow(record),
        className: styles.clickableRow,
      })
    : undefined

  return (
    <div className={rootClass}>
      <ConfigProvider
        renderEmpty={renderEmpty}
        theme={{
          components: {
            Table: {
              headerBg: '#fafafa',
              rowHoverBg: 'rgba(24, 144, 255, 0.03)',
            },
          },
        }}
      >
        <Table<T>
          className={styles.table}
          dataSource={dataSource}
          columns={mergedColumns}
          rowKey={rowKey}
          pagination={pagination ? {
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: pagination.onChange,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          } : false}
          onRow={onRowHandler}
          scroll={{ x: true }}
        />
      </ConfigProvider>
    </div>
  )
}

export default memo(EnhancedTable)
