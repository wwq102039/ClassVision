import { useEffect, useState } from 'react'
import { Button, DatePicker, Form, Modal, Popconfirm, Select, Space, Table, Tag, message, Alert, Empty } from 'antd'
import { PlusOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { listSessions, createSession, endSession, deleteSession, Session } from '../api/sessions'
import { listCourses, Course } from '../api/courses'
import { getErrMsg } from '../api/client'

const statusMeta: Record<string, { text: string; color: string }> = {
  scheduled: { text: '待开始', color: 'blue' },
  live: { text: '进行中', color: 'green' },
  finished: { text: '已结束', color: 'red' },
}

export default function Sessions() {
  const navigate = useNavigate()
  const [data, setData] = useState<Session[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseError, setCourseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      setData(await listSessions())
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  const loadCourses = () => {
    setCourseLoading(true)
    setCourseError('')
    listCourses()
      .then((items) => { setCourses(Array.isArray(items) ? items : []); setCourseError('') })
      .catch((err) => setCourseError(getErrMsg(err)))
      .finally(() => setCourseLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (saving) return
    let values
    try { values = await form.validateFields() } catch { return }
    setSaving(true)
    try {
      await createSession({
        course_id: values.course_id,
        session_date: values.session_date ? values.session_date.format('YYYY-MM-DD') : undefined,
      })
      message.success('课堂已创建')
      setModalOpen(false)
      form.resetFields()
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setSaving(false)
    }
  }

  const handleEnd = async (id: number) => {
    try {
      await endSession(id)
      message.success('课堂已结束')
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteSession(id)
      message.success('已删除')
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  return (
    <div>
      <section className="vision-hero compact">
        <div><span className="eyebrow">CLASSVISION / CLASSROOM CONTROL</span><h1>让每一堂课，被看见<span>。</span></h1><p>课堂编排、实时感知与考勤追踪，从这里开始。</p></div>
        <div className="hero-metric"><strong>{data.filter((s) => s.status === 'live').length.toString().padStart(2, '0')}</strong><span>进行中的课堂</span></div>
      </section>
      <Space style={{ marginBottom: 16, justifyContent: 'flex-end', width: '100%' }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields()
            loadCourses()
            setModalOpen(true)
          }}
        >
          新建课堂
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '课程', dataIndex: 'course_name' },
          { title: '日期', dataIndex: 'session_date', width: 130 },
          { title: '应到', dataIndex: 'expected_count', width: 80 },
          { title: '实到', dataIndex: 'actual_count', width: 80 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (s: string) => {
              const m = statusMeta[s] || { text: s, color: 'default' }
              return <Tag color={m.color}>{m.text}</Tag>
            },
          },
          {
            title: '操作',
            width: 220,
            render: (_, record) => (
              <Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<VideoCameraOutlined />}
                  onClick={() => navigate(`/sessions/${record.id}/monitor`)}
                >
                  监控
                </Button>
                {record.status === 'live' && (
                  <Button size="small" onClick={() => handleEnd(record.id)}>
                    结束
                  </Button>
                )}
                <Popconfirm
                  title="删除课堂"
                  description="将同时删除该课堂的考勤与申诉记录，确定删除？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(record.id)}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={<span className="modal-title-glow">新建课堂 · 课堂编排</span>}
        open={modalOpen}
        confirmLoading={saving}
        okButtonProps={{ disabled: courseLoading || !!courseError || courses.length === 0 }}
        onOk={handleCreate}
        onCancel={() => { if (!saving) setModalOpen(false) }}
        forceRender
        maskClosable={false}
        okText="创建课堂"
        cancelText="取消"
        className="session-modal"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="course_id"
            label="课程"
            rules={[{ required: true, message: '请选择课程' }]}
          >
            <Select
              showSearch
              allowClear
              loading={courseLoading}
              optionFilterProp="label"
              placeholder="选择课程"
              notFoundContent={courseLoading ? '正在加载课程…' : '没有匹配课程'}
              options={courses.map((c) => ({ label: `${c.name}（${c.class_name}）`, value: c.id }))}
            />
          </Form.Item>
          {courseError && <Alert type="warning" showIcon message="课程列表加载失败" description={courseError} action={<Button onClick={loadCourses} loading={courseLoading}>重试</Button>} />}
          {!courseLoading && !courseError && courses.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无课程，请先在课程管理中创建" />}
          <Form.Item name="session_date" label="上课日期（默认今天）">
            <DatePicker
              inputReadOnly={false}
              placeholder="选择上课日期"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
