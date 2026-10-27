import client, { getData } from './client'

export interface ImportResult {
  succeeded: Array<{ student_no: string; filename: string }>
  failed: Array<{ student_no?: string; filename?: string; reason: string }>
}

export async function importFaces(
  mapping: Array<{ student_no: string; filename: string }>,
  files: File[],
): Promise<ImportResult> {
  const form = new FormData()
  form.append('mapping', JSON.stringify(mapping))
  files.forEach((f) => form.append('files', f))
  const resp = await client.post('/faces/import', form)
  return getData<ImportResult>(resp)
}
