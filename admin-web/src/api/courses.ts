import client, { getData } from './client'

export interface Course {
  id: number
  name: string
  teacher_name?: string | null
  schedule_time?: string | null
  location?: string | null
  class_name: string
}

export interface CourseCreate {
  name: string
  teacher_name?: string
  schedule_time?: string
  location?: string
  class_name: string
}

export async function listCourses(): Promise<Course[]> {
  const resp = await client.get('/courses')
  return getData<Course[]>(resp)
}

export async function createCourse(data: CourseCreate): Promise<Course> {
  const resp = await client.post('/courses', data)
  return getData<Course>(resp)
}

export async function updateCourse(id: number, data: CourseCreate): Promise<Course> {
  const resp = await client.put(`/courses/${id}`, data)
  return getData<Course>(resp)
}

export async function deleteCourse(id: number): Promise<void> {
  await client.delete(`/courses/${id}`)
}
