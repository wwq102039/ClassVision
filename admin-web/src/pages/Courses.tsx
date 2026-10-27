import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Space, Table, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { listCourses, createCourse, updateCourse, deleteCourse, Course } from '../api/courses'
import { getErrMsg } from '../api/client'

export default function Courses() {
  const [data, setData] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      setData(await listCourses())
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    try {
      if (editing) {
        await updateCourse(editing.id, values)
        message.success('已更新')
      } else {
        await createCourse(values)
        message.success('已创建')
      }
      setModalOpen(false)
      setEditing(null)
      form.resetFields()
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (c: Course) => {
    setEditing(c)
    form.setFieldsValue(c)
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteCourse(id)
      message.success('已删除')
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'flex-end', width: '100%' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增课程
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '课程名称', dataIndex: 'name' },
          { title: '授课班级', dataIndex: 'class_name', width: 140 },
          { title: '教师', dataIndex: 'teacher_name', width: 120 },
          { title: '上课时间', dataIndex: 'schedule_time', width: 160 },
          { title: '上课地点', dataIndex: 'location', width: 160 },
          {
            title: '操作',
            width: 140,
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => openEdit(record)}>
                  编辑
                </Button>
                <Popconfirm
                  title="删除课程"
                  description="将同时删除该课程的课堂与考勤记录，确定删除？"
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
        title={editing ? '编辑课程' : '新增课程'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="class_name"
            label="授课班级"
            rules={[{ required: true, message: '请输入授课班级' }]}
          >
            <Input placeholder="如 计科2301" />
          </Form.Item>
          <Form.Item name="teacher_name" label="教师姓名">
            <Input />
          </Form.Item>
          <Form.Item name="schedule_time" label="上课时间">
            <Input placeholder="如 周一 08:00-09:40" />
          </Form.Item>
          <Form.Item name="location" label="上课地点">
            <Input placeholder="如 教学楼A-301" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
