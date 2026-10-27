import { useState } from 'react'
import { Layout, Menu, Typography, Avatar, Dropdown, theme } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  BookOutlined,
  VideoCameraOutlined,
  CheckCircleOutlined,
  IdcardOutlined,
  FileExcelOutlined,
  LogoutOutlined,
  UserOutlined,
  AuditOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import AiAssistant from '../components/AiAssistant/AiAssistant'
import ParticleField from '../components/ParticleField'

const { Sider, Header, Content } = Layout

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页总览' },
  { key: '/sessions', icon: <VideoCameraOutlined />, label: '课堂监控' },
  { key: '/students', icon: <TeamOutlined />, label: '学生管理' },
  { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
  { key: '/faces', icon: <IdcardOutlined />, label: '人脸库' },
  { key: '/attendance', icon: <CheckCircleOutlined />, label: '考勤明细' },
  { key: '/appeals', icon: <AuditOutlined />, label: '申诉审核' },
  { key: '/reports', icon: <FileExcelOutlined />, label: '报表导出' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const name = localStorage.getItem('cv_name') || '管理员'
  const {
    token: { colorBgContainer },
  } = theme.useToken()

  const selectedKey = menuItems.find((m) => location.pathname.startsWith(m.key))?.key || '/dashboard'

  const logout = () => {
    localStorage.removeItem('cv_token')
    localStorage.removeItem('cv_role')
    localStorage.removeItem('cv_name')
    navigate('/login', { replace: true })
  }

  return (
    <Layout className="admin-shell" style={{ minHeight: '100vh' }}>
      <ParticleField />
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={208}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: collapsed ? 14 : 17,
            letterSpacing: 1,
          }}
        >
          {collapsed ? '◉' : '◉ 智课眼 CLASSVISION'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography.Text strong style={{ fontSize: 16 }}>
            无感课堂考勤与学情分析系统
          </Typography.Text>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout }],
            }}
          >
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{name}</span>
            </span>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto', background: '#f0f2f5' }}>
          <div className="workspace-page" key={location.pathname} style={{ maxWidth: 1400, margin: '0 auto' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
      <AiAssistant />
    </Layout>
  )
}
