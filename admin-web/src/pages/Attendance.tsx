import { useEffect, useState } from 'react'
import { Button, Input, Popconfirm, Space, Table, Tag, message } from 'antd'
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { listAttendance, clearAttendance, AttendanceRecord } from '../api/attendance'
import { getErrMsg } from '../api/client'

export default function Attendance() {
  const [data, setData] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setData(await listAttendance(keyword ? { class_name: keyword } : undefined))
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    try {
      const r = await clearAttendance()
      message.success(`已清空 ${r.cleared_attendance} 条考勤记录，重置课堂统计`)
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          allowClear
          placeholder="按班级搜索"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={load}
        />
        <Popconfirm
          title="清空全部考勤记录"
          description="将删除所有签到记录与申诉，并重置课堂统计，确定继续？"
          okText="清空"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={handleClear}
        >
          <Button danger icon={<DeleteOutlined />}>清空考勤记录</Button>
        </Popconfirm>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '学号', dataIndex: 'student_no', width: 140 },
          { title: '姓名', dataIndex: 'name', width: 120 },
          { title: '班级', dataIndex: 'class_name', width: 140 },
          { title: '课程', dataIndex: 'course_name' },
          { title: '日期', dataIndex: 'date', width: 120 },
          { title: '签到时间', dataIndex: 'sign_time', width: 180 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: string) =>
              s === '正常' ? <Tag color="green">{s}</Tag> : <Tag color="orange">{s}</Tag>,
          },
          {
            title: '打卡照片',
            dataIndex: 'photo_path',
            width: 90,
            render: (p: string | null) =>
              p ? (
                <img src={`/static/${p}`} alt="打卡" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
              ) : (
                <span style={{ color: '#bbb' }}>-</span>
              ),
          },
        ]}
      />
    </div>
  )
}
