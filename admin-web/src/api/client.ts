import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 60000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('cv_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cv_token')
      localStorage.removeItem('cv_role')
      localStorage.removeItem('cv_name')
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  },
)

export function getData<T = any>(resp: any): T {
  return resp.data?.data
}

export function getMsg(resp: any): string {
  return resp.data?.message || 'ok'
}

export function getCode(resp: any): number {
  return resp.data?.code ?? 0
}

export function getErrMsg(err: any): string {
  return err?.response?.data?.message || err?.message || '请求失败，请稍后重试'
}

export default client