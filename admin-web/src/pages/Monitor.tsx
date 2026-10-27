import { useEffect, useRef, useState } from 'react'
import { Button, Space, Tag, Upload, message, Empty, Divider, Switch } from 'antd'
import {
  ArrowLeftOutlined,
  CameraOutlined,
  UploadOutlined,
  ReloadOutlined,
  ScanOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listSessions,
  getMonitor,
  getHeatmap,
  recognize,
  detectFaces,
  trackFaces,
  resetTracking,
  Monitor as MonitorData,
  Heatmap,
  TrackItem,
} from '../api/sessions'
import { getErrMsg } from '../api/client'

const darkBg = '#0b1b2b'
const panelBg = '#12283c'
const cardBg = '#0f2233'
const accent = '#22c1c3'

const palette = ['#22c1c3', '#5ab0ff', '#ff6b6b', '#3ddc97', '#ffd166', '#b983ff', '#ff8fb1', '#ff9f43']
const trackColor = (id: number) => palette[id % palette.length]

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: cardBg,
        borderRadius: 10,
        padding: '18px 20px',
        border: '1px solid #1d3a52',
        flex: 1,
      }}
    >
      <div style={{ color: '#8ba3b8', fontSize: 13 }}>{label}</div>
      <div style={{ color, fontSize: 34, fontWeight: 700, lineHeight: 1.3 }}>{value}</div>
    </div>
  )
}

export default function Monitor() {
  const navigate = useNavigate()
  const { id } = useParams()
  const sessionId = Number(id)

  const [courseName, setCourseName] = useState('')
  const [monitor, setMonitor] = useState<MonitorData | null>(null)
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null)
  const [headcount, setHeadcount] = useState(0)
  const [boxes, setBoxes] = useState<number[][]>([])
  const [recognizedList, setRecognizedList] = useState<
    Array<{ student_no: string; name: string; status: string; photo_path?: string | null }>
  >([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [busy, setBusy] = useState(false)

  const [cameraOn, setCameraOn] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const [trackingOn, setTrackingOn] = useState(false)
  const [tracks, setTracks] = useState<TrackItem[]>([])
  const trailsRef = useRef<Map<number, number[][]>>(new Map())

  const loadMonitor = async () => {
    try {
      const [m, h] = await Promise.all([getMonitor(sessionId), getHeatmap(sessionId)])
      setMonitor(m)
      setHeatmap(h)
    } catch (err) {
      message.error(getErrMsg(err))
    }
  }

  useEffect(() => {
    listSessions()
      .then((list) => {
        const s = list.find((x) => x.id === sessionId)
        if (s) setCourseName(s.course_name || `课堂 #${sessionId}`)
      })
      .catch(() => {})
    loadMonitor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(loadMonitor, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, sessionId])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      })
      streamRef.current = stream
      setCameraOn(true)
    } catch {
      message.warning('无法访问摄像头，可改用「上传教室照片」')
    }
  }

  // 等 <video> 元素随 cameraOn 挂载后，再挂流并播放（否则会黑屏）
  useEffect(() => {
    if (cameraOn && streamRef.current && videoRef.current) {
      videoRef.current.muted = true
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraOn])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
    setHeadcount(0)
    setBoxes([])
    setTracks([])
    trailsRef.current.clear()
    if (trackingOn) {
      resetTracking(sessionId).catch(() => {})
    }
  }

  const toggleTracking = async (checked: boolean) => {
    if (checked) {
      try {
        await resetTracking(sessionId)
      } catch {
        // 忽略重置失败，跟踪照常
      }
      trailsRef.current.clear()
      setTracks([])
      setBoxes([])
    } else {
      trailsRef.current.clear()
      setTracks([])
    }
    setTrackingOn(checked)
  }

  // 摄像头开启时，循环抓帧：追踪模式走 ReID 跟踪，否则纯检测
  useEffect(() => {
    if (!cameraOn) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const loop = async () => {
      const frame = await captureFrame()
      if (cancelled) return
      if (frame) {
        try {
          if (trackingOn) {
            const r = await trackFaces(sessionId, frame)
            if (!cancelled) {
              setHeadcount(r.count)
              setTracks(r.tracks || [])
              const m = trailsRef.current
              for (const t of r.tracks || []) {
                const arr = m.get(t.id) || []
                arr.push(t.center)
                if (arr.length > 40) arr.shift()
                m.set(t.id, arr)
              }
            }
          } else {
            const r = await detectFaces(frame)
            if (!cancelled) {
              setHeadcount(r.count)
              setBoxes(r.boxes || [])
            }
          }
        } catch {
          // 单帧检测失败忽略，继续下一轮
        }
      }
      // 不额外加延迟，帧率由后端检测/跟踪往返耗时决定，画面更跟手
      if (!cancelled) timer = setTimeout(loop, 0)
    }
    loop()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, trackingOn, sessionId])

  // 在视频上叠加绘制检测框 / 追踪轨迹（坐标按 objectFit:contain 的缩放与偏移映射）
  useEffect(() => {
    const canvas = overlayRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    canvas.width = cw
    canvas.height = ch
    ctx.clearRect(0, 0, cw, ch)
    if (!cameraOn) return
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return
    const scale = Math.min(cw / vw, ch / vh)
    const dw = vw * scale
    const dh = vh * scale
    const ox = (cw - dw) / 2
    const oy = (ch - dh) / 2
    const toX = (x: number) => x * scale + ox
    const toY = (y: number) => y * scale + oy

    if (trackingOn) {
      // 轨迹（最近 N 帧中心点连线）
      for (const [id, pts] of trailsRef.current.entries()) {
        if (pts.length < 2) continue
        ctx.strokeStyle = trackColor(id)
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]))
        for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]))
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      // 跟踪框 + ID 标签
      for (const t of tracks) {
        const [x1, y1, x2, y2] = t.box
        const color = trackColor(t.id)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.strokeRect(toX(x1), toY(y1), toX(x2) - toX(x1), toY(y2) - toY(y1))
        ctx.fillStyle = color
        ctx.font = 'bold 13px sans-serif'
        ctx.fillText(`#${t.id}`, toX(x1), toY(y1) - 4)
      }
    } else {
      ctx.strokeStyle = '#22c1c3'
      ctx.lineWidth = 2
      ctx.fillStyle = '#22c1c3'
      ctx.font = '12px sans-serif'
      for (const b of boxes) {
        const [x1, y1, x2, y2, score] = b
        const dx1 = toX(x1)
        const dy1 = toY(y1)
        const dx2 = toX(x2)
        const dy2 = toY(y2)
        ctx.strokeRect(dx1, dy1, dx2 - dx1, dy2 - dy1)
        if (score != null) ctx.fillText(score.toFixed(2), dx1, dy1 - 4)
      }
    }
  }, [boxes, tracks, cameraOn, trackingOn])

  const captureFrame = async (): Promise<File | null> => {
    const video = videoRef.current
    if (!video) return null
    // 限制上传尺寸（等比缩到 640 宽），减少网络传输与后端解码开销；检测端会再 letterbox 缩放
    const maxW = 640
    const scale = Math.min(1, maxW / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(new File([blob], 'capture.jpg', { type: 'image/jpeg' }))
        else resolve(null)
      }, 'image/jpeg', 0.85)
    })
  }

  const setImage = (file: File) => {
    setPendingImage(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const doRecognize = async () => {
    let image = pendingImage
    if (cameraOn) {
      const frame = await captureFrame()
      if (frame) {
        image = frame
        setImage(frame)
      }
    }
    if (!image) {
      message.warning('请先上传教室照片或打开摄像头抓拍')
      return
    }
    setBusy(true)
    try {
      const r = await recognize(sessionId, image)
      setHeadcount(r.detected_count)
      setRecognizedList(r.recognized.map((x) => ({ ...x })))
      message.success(
        `检测 ${r.detected_count} 人，识别 ${r.recognized.length} 人，未识别 ${r.unrecognized.length} 人`,
      )
      await loadMonitor()
    } catch (err) {
      message.error(getErrMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const expected = monitor?.expected ?? 0
  const actual = monitor?.actual ?? 0
  const absent = monitor?.absent ?? 0

  return (
    <div
      style={{
        background: darkBg,
        minHeight: 'calc(100vh - 48px)',
        borderRadius: 12,
        padding: 24,
        color: '#e6f1ff',
        margin: -24,
      }}
    >
      <Space style={{ marginBottom: 20, width: '100%', justifyContent: 'space-between' }}>
        <Space size={16}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/sessions')}
            style={{ background: panelBg, borderColor: '#1d3a52', color: '#e6f1ff' }}
          >
            返回
          </Button>
          <span style={{ fontSize: 20, fontWeight: 600 }}>{courseName}</span>
          {monitor?.stream_status === 'live' ? (
            <Tag color="green">进行中</Tag>
          ) : monitor?.stream_status === 'finished' ? (
            <Tag color="red">已结束</Tag>
          ) : (
            <Tag>待开始</Tag>
          )}
        </Space>
        <Space>
          <span style={{ color: '#8ba3b8', fontSize: 13 }}>自动刷新</span>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} />
          <Button
            icon={<ReloadOutlined />}
            onClick={loadMonitor}
            style={{ background: panelBg, borderColor: '#1d3a52', color: '#e6f1ff' }}
          >
            刷新
          </Button>
        </Space>
      </Space>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <StatCard label="应到人数" value={expected} color="#5ab0ff" />
        <StatCard label="实到人数" value={actual} color="#3ddc97" />
        <StatCard label="缺席人数" value={absent} color="#ff6b6b" />
        <StatCard label="画面人数" value={headcount} color={accent} />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 380 }}>
          <div
            style={{
              background: '#02080f',
              borderRadius: 10,
              border: '1px solid #1d3a52',
              height: 360,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {cameraOn ? (
              <>
                <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                <canvas
                  ref={overlayRef}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    background: 'rgba(0,0,0,0.6)',
                    color: accent,
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {trackingOn ? '追踪人数' : '检测人数'}：{headcount}
                </div>
              </>
            ) : previewUrl ? (
              <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span style={{ color: '#5b7488' }}>打开摄像头或上传教室照片</span>}
              />
            )}
          </div>
          <Space style={{ marginTop: 16 }} wrap>
            {cameraOn ? (
              <>
                <Button type="primary" icon={<CameraOutlined />} onClick={doRecognize} loading={busy}>
                  抓拍并识别
                </Button>
                <Button onClick={stopCamera} style={{ background: panelBg, borderColor: '#1d3a52', color: '#e6f1ff' }}>
                  关闭摄像头
                </Button>
                <span style={{ color: '#8ba3b8', fontSize: 13, marginLeft: 8 }}>轨迹追踪</span>
                <Switch checked={trackingOn} onChange={toggleTracking} />
              </>
            ) : (
              <Button
                icon={<CameraOutlined />}
                onClick={startCamera}
                style={{ background: panelBg, borderColor: '#1d3a52', color: '#e6f1ff' }}
              >
                打开摄像头
              </Button>
            )}
            <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => { setImage(f); return false }}>
              <Button icon={<UploadOutlined />} style={{ background: panelBg, borderColor: '#1d3a52', color: '#e6f1ff' }}>
                上传教室照片
              </Button>
            </Upload>
            {pendingImage && !cameraOn && (
              <Button type="primary" icon={<ScanOutlined />} onClick={doRecognize} loading={busy}>
                识别签到
              </Button>
            )}
          </Space>
        </div>

        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ background: panelBg, borderRadius: 10, border: '1px solid #1d3a52', padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>缺席名单</div>
            {monitor?.absent_names?.length ? (
              monitor.absent_names.map((n) => (
                <Tag key={n} color="red" style={{ marginBottom: 6 }}>
                  {n}
                </Tag>
              ))
            ) : (
              <div style={{ color: '#5b7488', fontSize: 13 }}>暂无缺席</div>
            )}
          </div>

          <div style={{ background: panelBg, borderRadius: 10, border: '1px solid #1d3a52', padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>课堂热力图</div>
            {heatmap?.available && heatmap.grid ? (
              <div>
                {Object.entries(heatmap.grid).map(([zone, count]) => (
                  <div key={zone} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#8ba3b8' }}>
                      <span>{zone}</span>
                      <span>{count} 人</span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: '#1d3a52',
                        borderRadius: 4,
                        marginTop: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, (count / Math.max(1, monitor?.actual || 1)) * 100)}%`,
                          background: accent,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#5b7488', fontSize: 13 }}>{heatmap?.message || '课堂未在进行中'}</div>
            )}
          </div>

          <div style={{ background: panelBg, borderRadius: 10, border: '1px solid #1d3a52', padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>最近识别</div>
            {recognizedList.length ? (
              recognizedList.map((r) => (
                <div key={r.student_no} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <Space size={10}>
                    {r.photo_path ? (
                      <img
                        src={`/static/${r.photo_path}`}
                        alt={r.name}
                        style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }}
                      />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: '#1d3a52' }} />
                    )}
                    <span>
                      {r.name} <span style={{ color: '#8ba3b8' }}>({r.student_no})</span>
                    </span>
                  </Space>
                  <Tag color={r.status === '正常' ? 'green' : 'orange'}>{r.status}</Tag>
                </div>
              ))
            ) : (
              <div style={{ color: '#5b7488', fontSize: 13 }}>尚未识别</div>
            )}
            <Divider style={{ margin: '12px 0', borderColor: '#1d3a52' }} />
            <div style={{ fontSize: 13, color: '#8ba3b8' }}>
              未识别抓拍：{monitor?.unrecognized?.length ?? 0} 条
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
