import { useEffect, useState } from 'react'
import { Button, Card, Select, Space, Table, Tag, Upload, message } from 'antd'
import { UploadOutlined, ImportOutlined } from '@ant-design/icons'
import { listStudents, Student } from '../api/students'
import { importFaces } from '../api/faces'
import { getErrMsg } from '../api/client'

interface PendingFile {
  file: File
  studentNo: string
}

const stem = (name: string) => name.replace(/\.[^.]+$/, '')

export default function Faces() {
  const [students, setStudents] = useState<Student[]>([])
  const [pending, setPending] = useState<PendingFile[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    try {
      setStudents(await listStudents())
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onSelectFiles = (files: File[]) => {
    const items: PendingFile[] = files.map((f) => ({ file: f, studentNo: stem(f.name) }))
    setPending((prev) => [...prev, ...items])
  }

  const doImport = async () => {
    const missing = pending.filter((p) => !p.studentNo)
    if (missing.length) {
      message.warning(`有 ${missing.length} 张照片未指定学号`)
      return
    }
    setLoading(true)
    try {
      const mapping = pending.map((p) => ({ student_no: p.studentNo, filename: p.file.name }))
      const result = await importFaces(mapping, pending.map((p) => p.file))
      message.success(
        `导入完成：成功 ${result.succeeded.length} 张，失败 ${result.failed.length} 张`,
      )
      if (result.failed.length) {
        console.warn('导入失败明细', result.failed)
      }
      setPending([])
      load()
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Card title="批量导入人脸" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload
            multiple
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              onSelectFiles([file])
              return false
            }}
          >
            <Button icon={<UploadOutlined />}>选择学生照片（可多选）</Button>
          </Upload>
          <div style={{ color: '#888', fontSize: 12 }}>
            建议文件名与学号一致（如 20230101.jpg），导入时会自动按文件名匹配学号，也可在下方手动调整。
          </div>
        </Space>

        {pending.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {pending.map((p, idx) => (
              <Space key={`${p.file.name}-${idx}`} style={{ marginBottom: 8 }}>
                <span style={{ width: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.file.name}
                </span>
                <Select
                  showSearch
                  placeholder="选择学生"
                  style={{ width: 220 }}
                  value={p.studentNo || undefined}
                  options={students.map((s) => ({
                    label: `${s.student_no} · ${s.name}`,
                    value: s.student_no,
                  }))}
                  onChange={(v) =>
                    setPending((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, studentNo: v } : x)),
                    )
                  }
                />
              </Space>
            ))}
            <Button
              type="primary"
              icon={<ImportOutlined />}
              loading={loading}
              onClick={doImport}
              style={{ marginTop: 8 }}
            >
              开始导入（{pending.length} 张）
            </Button>
          </div>
        )}
      </Card>

      <Table
        rowKey="id"
        dataSource={students}
        columns={[
          { title: '学号', dataIndex: 'student_no', width: 140 },
          { title: '姓名', dataIndex: 'name', width: 120 },
          { title: '班级', dataIndex: 'class_name', width: 140 },
          {
            title: '人脸状态',
            dataIndex: 'has_embedding',
            width: 120,
            render: (v: boolean) =>
              v ? <Tag color="green">已录入</Tag> : <Tag color="orange">未录入</Tag>,
          },
        ]}
        pagination={{ pageSize: 10 }}
      />
    </div>
  )
}
