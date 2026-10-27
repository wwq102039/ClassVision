import client from './client'

export async function exportReport(params: {
  class_name?: string
  date_from?: string
  date_to?: string
  course_id?: number
}): Promise<Blob> {
  const resp = await client.get('/reports/export', {
    params,
    responseType: 'blob',
  })
  return resp.data as Blob
}
