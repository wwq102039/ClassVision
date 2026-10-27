import { useEffect, useState } from 'react'
import { Button, Card, DatePicker, Form, Input, Select, Space, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { listCourses, Course } from '../api/courses'
import { exportReport } from '../api/reports'
import { getErrMsg } from '../api/client'

const { RangePicker } = DatePicker

export default function Reports() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    listCourses()
      .then(setCourses)
      .catch(() => {})
  }, [])

  const handleExport = async () => {
    const values = await form.validateFields()
    setLoading(true)
    try {
      const [start, end] = values.range || []
      const blob = await exportReport({
        class_name: values.class_name || undefined,
        course_id: values.course_id || undefined,
        date_from: start ? start.format('YYYY-MM-DD') : undefined,
        date_to: end ? end.format('YYYY-MM-DD') : undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'attendance_report.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="考勤报表导出" style={{ maxWidth: 720 }}>
      <Form form={form} layout="inline" style={{ rowGap: 16 }}>
        <Form.Item name="class_name" label="班级">
          <Input placeholder="如 计科2301" allowClear style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="course_id" label="课程">
          <Select
            allowClear
            placeholder="全部课程"
            style={{ width: 180 }}
            options={courses.map((c) => ({ label: c.name, value: c.id }))}
          />
        </Form.Item>
        <Form.Item name="range" label="日期范围">
          <RangePicker />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" icon={<DownloadOutlined />} loading={loading} onClick={handleExport}>
              导出 Excel
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  )
}
