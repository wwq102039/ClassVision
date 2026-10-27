import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, message } from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { listStudents, createStudent, updateStudent, deleteStudent, Student } from '../api/students'
import { getErrMsg } from '../api/client'

export default function Students() {
  const [data, setData] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const list = await listStudents(keyword ? { class_name: keyword } : undefined)
      setData(list)
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (s: Student) => {
    setEditing(s)
    form.setFieldsValue(s)
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    try {
      if (editing) {
        await updateStudent(editing.id, values)
        message.success('已更新')
      } else {
        await createStudent(values)
        message.success('已创建')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteStudent(id)
      message.success('已删除')
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Input
          allowClear
          placeholder="按班级搜索（如 计科2301）"
          prefix={<SearchOutlined />}
          style={{ width: 260 }}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={load}
        />
        <Space>
          <Button onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增学生
          </Button>
        </Space>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '学号', dataIndex: 'student_no', width: 140 },
          { title: '姓名', dataIndex: 'name', width: 120 },
          { title: '班级', dataIndex: 'class_name', width: 140 },
          { title: '专业', dataIndex: 'major' },
          {
            title: '人脸录入',
            dataIndex: 'has_embedding',
            width: 110,
            render: (v: boolean) =>
              v ? <Tag color="green">已录入</Tag> : <Tag color="orange">未录入</Tag>,
          },
          { title: '注册时间', dataIndex: 'register_time', width: 180 },
          {
            title: '操作',
            width: 160,
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => openEdit(record)}>
                  编辑
                </Button>
                <Popconfirm title="确认删除该学生？" onConfirm={() => handleDelete(record.id)}>
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
        title={editing ? '编辑学生' : '新增学生'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="student_no" label="学号" rules={[{ required: true, message: '请输入学号' }]}>
            <Input disabled={!!editing} placeholder="如 20230101" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="class_name"
            label="班级"
            rules={[{ required: true, message: '请输入班级' }]}
          >
            <Input placeholder="如 计科2301" />
          </Form.Item>
          <Form.Item name="major" label="专业">
            <Input placeholder="如 计算机科学与技术" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
