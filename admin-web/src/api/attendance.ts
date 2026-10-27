import client, { getData } from './client'

export interface AttendanceRecord {
  id: number
  student_no: string
  name: string
  class_name: string
  course_name: string
  session_id: number
  date?: string | null
  sign_time?: string | null
  status: string
  photo_path?: string | null
}

export async function listAttendance(params?: {
  class_name?: string
  session_id?: number
}): Promise<AttendanceRecord[]> {
  const resp = await client.get('/attendance', { params })
  return getData<AttendanceRecord[]>(resp)
}

export async function clearAttendance(): Promise<{
  cleared_attendance: number
  cleared_appeals: number
}> {
  const resp = await client.delete('/attendance')
  return getData(resp)
}
