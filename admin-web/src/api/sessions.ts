import client, { getData } from './client'

export interface Session {
  id: number
  course_id: number
  course_name?: string | null
  session_date?: string | null
  expected_count: number
  actual_count: number
  quality_score?: number | null
  status: string
}

export interface Monitor {
  expected: number
  actual: number
  absent: number
  absent_names: string[]
  quality_score?: number | null
  unrecognized: Array<{ box: number[]; frame_time?: string }>
  stream_status: string
}

export interface Heatmap {
  available: boolean
  session_id?: number
  message?: string
  grid?: Record<string, number>
}

export interface RecognizeResult {
  detected_count: number
  recognized: Array<{
    student_no: string
    name: string
    status: string
    photo_path?: string | null
    box: number[]
  }>
  unrecognized: Array<{ box: number[]; reason: string }>
}

export interface DetectResult {
  count: number
  boxes: number[][]
}

export interface TrackItem {
  id: number
  box: number[]
  center: number[]
  score: number
  hits: number
}

export interface TrackResult {
  count: number
  tracks: TrackItem[]
  active: number
  total_created: number
  alive: number
  frame: number
}

export async function listSessions(): Promise<Session[]> {
  const resp = await client.get('/sessions')
  return getData<Session[]>(resp)
}

export async function createSession(data: {
  course_id: number
  session_date?: string
}): Promise<Session> {
  const resp = await client.post('/sessions', data)
  return getData<Session>(resp)
}

export async function getMonitor(sessionId: number): Promise<Monitor> {
  const resp = await client.get(`/sessions/${sessionId}/monitor`)
  return getData<Monitor>(resp)
}

export async function getHeatmap(sessionId: number): Promise<Heatmap> {
  const resp = await client.get(`/sessions/${sessionId}/heatmap`)
  return getData<Heatmap>(resp)
}

export async function endSession(sessionId: number): Promise<{ session_id: number; status: string }> {
  const resp = await client.post(`/sessions/${sessionId}/end`)
  return getData(resp)
}

export async function deleteSession(sessionId: number): Promise<void> {
  await client.delete(`/sessions/${sessionId}`)
}

export async function recognize(sessionId: number, image: File): Promise<RecognizeResult> {
  const form = new FormData()
  form.append('session_id', String(sessionId))
  form.append('image', image)
  const resp = await client.post('/recognition/recognize', form, { timeout: 60000 })
  return getData<RecognizeResult>(resp)
}

export async function detectFaces(image: File): Promise<DetectResult> {
  const form = new FormData()
  form.append('image', image)
  const resp = await client.post('/recognition/detect', form)
  return getData<DetectResult>(resp)
}

export async function trackFaces(sessionId: number, image: File): Promise<TrackResult> {
  const form = new FormData()
  form.append('session_id', String(sessionId))
  form.append('image', image)
  const resp = await client.post('/recognition/track', form, { timeout: 60000 })
  return getData<TrackResult>(resp)
}

export async function resetTracking(sessionId: number): Promise<{ reset: boolean }> {
  const form = new FormData()
  form.append('session_id', String(sessionId))
  const resp = await client.post('/recognition/track/reset', form)
  return getData(resp)
}
