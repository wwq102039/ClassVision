import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd'
import { TeamOutlined, BookOutlined, VideoCameraOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { listStudents } from '../api/students'
import { listCourses } from '../api/courses'
import { listSessions, Session } from '../api/sessions'
import { listAttendance } from '../api/attendance'

const statusColor = (s: string) =>
  s === 'live' ? 'green' : s === 'scheduled' ? 'blue' : 'default'

function rateColor(r: number) {
  if (r >= 0.9) return '#3ddc97'
  if (r >= 0.7) return '#ffb340'
  return '#ff6b6b'
}

export default function Dashboard() {
  const [studentCount, setStudentCount] = useState(0)
  const [courseCount, setCourseCount] = useState(0)
  const [attendanceCount, setAttendanceCount] = useState(0)
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    Promise.all([listStudents(), listCourses(), listSessions(), listAttendance()])
      .then(([stu, cou, ses, att]) => {
        setStudentCount(stu.length)
        setCourseCount(cou.length)
        setAttendanceCount(att.length)
        setSessions(ses)
      })
      .catch(() => {})
  }, [])

  const trend = sessions.slice(0, 8).reverse()

  return (
    <div>
      <section className="vision-hero">
        <div><span className="eyebrow">CLASSVISION / INTELLIGENCE CONSOLE</span><h1>感知课堂<span>，</span><br />洞见每一次成长。</h1><p>将课堂现场转化为可见的数据，让教学决策更有依据。</p><div className="hero-chips"><span>人脸识别</span><span>无感考勤</span><span>学情洞察</span></div></div>
        <div className="vision-orb" aria-hidden="true"><div className="orb-ring" /><div className="orb-ring second" /><div className="orb-core">CV<small>VISION ENGINE</small></div><div className="orb-scan" /></div>
      </section>
      <Row gutter={16}>
        <Col xs={12} xl={6}>
          <Card>
            <Statistic title="学生总数" value={studentCount} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={12} xl={6}>
          <Card>
            <Statistic title="课程数" value={courseCount} prefix={<BookOutlined />} />
          </Card>
        </Col>
        <Col xs={12} xl={6}>
          <Card>
            <Statistic title="课堂记录" value={sessions.length} prefix={<VideoCameraOutlined />} />
          </Card>
        </Col>
        <Col xs={12} xl={6}>
          <Card>
            <Statistic title="考勤记录" value={attendanceCount} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card title="出勤率趋势（学情分析）" style={{ marginTop: 16 }}>
        {trend.length ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 180, padding: '8px 4px 0' }}>
            {trend.map((s) => {
              const rate = s.expected_count > 0 ? s.actual_count / s.expected_count : 0
              const pct = Math.round(rate * 100)
              return (
                <div
                  key={s.id}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ fontSize: 12, color: rateColor(rate) }}>{pct}%</span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 48,
                      height: Math.max(6, rate * 120),
                      background: rateColor(rate),
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <div style={{ fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 1.3 }}>
                    {s.session_date}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Typography.Text type="secondary">暂无课堂数据</Typography.Text>
        )}
      </Card>

      <Card title="最近课堂" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={sessions.slice(0, 5)}
          pagination={false}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 70 },
            { title: '课程', dataIndex: 'course_name' },
            { title: '日期', dataIndex: 'session_date', width: 130 },
            { title: '应到', dataIndex: 'expected_count', width: 80 },
            { title: '实到', dataIndex: 'actual_count', width: 80 },
            {
              title: '质量分',
              dataIndex: 'quality_score',
              width: 90,
              render: (v: number | null) =>
                v == null ? (
                  <span style={{ color: '#bbb' }}>-</span>
                ) : (
                  <span style={{ color: v >= 0.8 ? '#3ddc97' : v >= 0.6 ? '#ffb340' : '#ff6b6b' }}>
                    {Math.round(v * 100)}
                  </span>
                ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: string) => <Tag color={statusColor(s)}>{{ live: '进行中', scheduled: '待开始', finished: '已结束' }[s] || s}</Tag>,
            },
          ]}
        />
      </Card>
    </div>
  )
}
