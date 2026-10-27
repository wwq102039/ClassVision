import { useEffect, useState } from 'react'
import { Button, Input, Modal, Segmented, Space, Table, Tag, message } from 'antd'
import { listAppeals, reviewAppeal, Appeal } from '../api/appeals'
import { getErrMsg } from '../api/client'

const statusMeta: Record<string, { text: string; color: string }> = {
  pending: { text: '待审核', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已驳回', color: 'red' },
}

export default function Appeals() {
  const [data, setData] = useState<Appeal[]>([])
  const [filter, setFilter] = useState<string>('pending')
  const [loading, setLoading] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<{ id: number; decision: 'approve' | 'reject' } | null>(null)
  const [comment, setComment] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setData(await listAppeals(filter === 'all' ? undefined : filter))
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const openReview = (id: number, decision: 'approve' | 'reject') => {
    setReviewTarget({ id, decision })
    setComment('')
  }

  const submitReview = async () => {
    if (!reviewTarget) return
    try {
      await reviewAppeal(reviewTarget.id, reviewTarget.decision, comment.trim() || undefined)
      message.success(reviewTarget.decision === 'approve' ? '已通过，该学生记为出勤' : '已驳回')
      setReviewTarget(null)
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as string)}
          options={[
            { label: '待审核', value: 'pending' },
            { label: '已通过', value: 'approved' },
            { label: '已驳回', value: 'rejected' },
            { label: '全部', value: 'all' },
          ]}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '学号', dataIndex: 'student_no', width: 130 },
          { title: '姓名', dataIndex: 'name', width: 110 },
          { title: '班级', dataIndex: 'class_name', width: 130 },
          { title: '课程', dataIndex: 'course_name' },
          { title: '日期', dataIndex: 'session_date', width: 120 },
          { title: '申诉理由', dataIndex: 'reason' },
          { title: '审核评语', dataIndex: 'comment', render: (c: string | null) => c || '-' },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: string) => {
              const m = statusMeta[s] || { text: s, color: 'default' }
              return <Tag color={m.color}>{m.text}</Tag>
            },
          },
          {
            title: '操作',
            width: 160,
            render: (_, record) =>
              record.status === 'pending' ? (
                <Space>
                  <Button size="small" type="primary" onClick={() => openReview(record.id, 'approve')}>
                    通过
                  </Button>
                  <Button size="small" danger onClick={() => openReview(record.id, 'reject')}>
                    驳回
                  </Button>
                </Space>
              ) : (
                <span style={{ color: '#999' }}>已处理</span>
              ),
          },
        ]}
      />

      <Modal
        title={reviewTarget?.decision === 'approve' ? '通过申诉' : '驳回申诉'}
        open={!!reviewTarget}
        onOk={submitReview}
        onCancel={() => setReviewTarget(null)}
        okText="确认"
        cancelText="取消"
        okButtonProps={reviewTarget?.decision === 'reject' ? { danger: true } : undefined}
      >
        <Input.TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="审核评语（可选）"
        />
      </Modal>
    </div>
  )
}
