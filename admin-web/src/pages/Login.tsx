import { useState } from 'react'
import { Button, Form, Input, message, Segmented, Typography } from 'antd'
import { UserOutlined, LockOutlined, EyeInvisibleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import { getErrMsg } from '../api/client'
import ParticleField from '../components/ParticleField'

export default function Login() {
  const navigate = useNavigate()
  const [role, setRole] = useState<'teacher' | 'student'>('teacher')
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const data = await login(values.username, values.password, role)
      localStorage.setItem('cv_token', data.token)
      localStorage.setItem('cv_role', data.role)
      localStorage.setItem('cv_name', data.name)
      message.success(`欢迎，${data.name}`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="login-stage"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      }}
    >
      <ParticleField />
      <div
        className="login-panel"
        style={{
          width: 'min(380px, calc(100vw - 32px))',
          padding: '40px 32px',
          background: 'rgba(9, 28, 48, .88)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            智课眼 · 管理端
          </Typography.Title>
          <Typography.Text type="secondary">无感课堂考勤与学情分析系统</Typography.Text>
        </div>
        <Segmented
          block
          value={role}
          onChange={(v) => setRole(v as 'teacher' | 'student')}
          options={[
            { label: '教师 / 管理员', value: 'teacher' },
            { label: '学生', value: 'student' },
          ]}
          style={{ marginBottom: 24 }}
        />
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} placeholder={role === 'teacher' ? '管理员账号' : '学号'} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登 录
            </Button>
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          <EyeInvisibleOutlined /> 默认教师账号 admin / admin123
        </Typography.Text>
      </div>
    </div>
  )
}
