import client, { getData } from './client'

export interface LoginResp {
  token: string
  role: string
  name: string
  student_no?: string | null
}

export async function login(username: string, password: string, role: string): Promise<LoginResp> {
  const resp = await client.post('/auth/login', { username, password, role })
  return getData<LoginResp>(resp)
}