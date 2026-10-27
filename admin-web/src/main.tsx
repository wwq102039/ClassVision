import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { getAntdTheme } from './theme/theme'
import App from './App'
import 'antd/dist/reset.css'
import './styles/index.less'
import './index.css'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

const theme = getAntdTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    locale={zhCN}
    theme={theme}
  >
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>,
)
