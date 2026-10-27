import client from './client'

export async function myAttendance(courseId) {
  const resp = await client.get('/attendance/mine', {
    params: courseId ? { course_id: courseId } : {},
  })
  return resp.data.data
}

export async function createAppeal(sessionId, reason) {
  const resp = await client.post('/attendance/appeal', {
    session_id: sessionId,
    reason: reason || '',
  })
  return resp.data.data
}

export async function checkinSessions() {
  const resp = await client.get('/attendance/checkin/sessions')
  return resp.data.data
}

export async function selfCheckin(sessionId, file) {
  const fd = new FormData()
  fd.append('session_id', String(sessionId))
  fd.append('image', file)
  const resp = await client.post('/attendance/checkin', fd)
  return resp.data.data
}

export async function myAppeals() {
  const resp = await client.get('/attendance/appeals')
  return resp.data.data
}
