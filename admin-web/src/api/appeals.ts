import client, { getData } from './client'

export interface Appeal {
  id: number
  student_no: string
  name: string
  class_name: string
  course_name: string
  session_id: number
  session_date?: string | null
  reason: string
  status: string
  comment?: string | null
  created_at?: string | null
}

export async function listAppeals(status?: string): Promise<Appeal[]> {
  const resp = await client.get('/appeals', { params: status ? { status } : {} })
  return getData<Appeal[]>(resp)
}

export async function reviewAppeal(
  id: number,
  decision: 'approve' | 'reject',
  comment?: string,
): Promise<void> {
  await client.post(`/appeals/${id}/review`, { decision, comment })
}
