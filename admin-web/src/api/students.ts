import client, { getData } from './client'

export interface Student {
  id: number
  student_no: string
  name: string
  class_name: string
  major?: string | null
  has_embedding: boolean
  register_time?: string | null
}

export interface StudentCreate {
  student_no: string
  name: string
  class_name: string
  major?: string
}

export interface StudentUpdate {
  name?: string
  class_name?: string
  major?: string
}

export async function listStudents(params?: {
  class_name?: string
  major?: string
}): Promise<Student[]> {
  const resp = await client.get('/students', { params })
  return getData<Student[]>(resp)
}

export async function createStudent(data: StudentCreate): Promise<Student> {
  const resp = await client.post('/students', data)
  return getData<Student>(resp)
}

export async function updateStudent(id: number, data: StudentUpdate): Promise<Student> {
  const resp = await client.put(`/students/${id}`, data)
  return getData<Student>(resp)
}

export async function deleteStudent(id: number): Promise<void> {
  await client.delete(`/students/${id}`)
}
