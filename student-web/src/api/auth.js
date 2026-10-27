import client from './client'

export async function login(username, password) {
  const resp = await client.post('/auth/login', {
    username,
    password,
    role: 'student',
  })
  return resp.data.data
}
