import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AudioOutlined,
  CloseOutlined,
  LoadingOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { getAssistantStatus, type AssistantStatusSnapshot } from '../../api/assistant'
import styles from './AiAssistant.module.css'

type AssistantState =
  | 'idle'
  | 'connecting'
  | 'pairing'
  | 'connected'
  | 'answering'
  | 'speaking'
  | 'error'
type MessageRole = 'user' | 'assistant' | 'system'

interface ChatMessage {
  id: number
  role: MessageRole
  text: string
}

const RESPONSE_SILENCE_TIMEOUT_MS = 45_000
const INPUT_SAMPLE_RATE = 16_000
const OUTPUT_SAMPLE_RATE = 24_000

function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [assistantState, setAssistantState] = useState<AssistantState>('idle')
  const [statusSnapshot, setStatusSnapshot] = useState<AssistantStatusSnapshot | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [startingRecording, setStartingRecording] = useState(false)

  const isOpenRef = useLatest(isOpen)
  const assistantStateRef = useLatest(assistantState)
  const statusSnapshotRef = useLatest(statusSnapshot)
  const recordingRef = useLatest(recording)
  const pairingCodeRef = useLatest(pairingCode)
  const startingRecordingRef = useLatest(startingRecording)

  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackCursorRef = useRef(0)
  const nextMessageIdRef = useRef(1)
  const responseWatchdogRef = useRef<number | null>(null)
  const microphoneStreamRef = useRef<MediaStream | null>(null)
  const microphoneContextRef = useRef<AudioContext | null>(null)
  const microphoneProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const microphoneSilenceRef = useRef<GainNode | null>(null)
  const remoteConnectedRef = useRef(false)
  const recordingGenerationRef = useRef(0)
  const spaceHeldRef = useRef(false)

  const assistantReady =
    !!statusSnapshot?.enabled &&
    (statusSnapshot.pairing_required ||
      (statusSnapshot.configured && statusSnapshot.codec_available))

  function stateLabel(): string {
    switch (assistantState) {
      case 'connecting':
        return statusSnapshot?.configured ? '设备已认证' : '连接中'
      case 'pairing':
        return '待绑定'
      case 'connected':
        return '设备已认证'
      case 'answering':
        return '生成回答'
      case 'speaking':
        return '正在播报'
      case 'error':
        return '连接异常'
      default:
        if (statusSnapshot?.pairing_required && !statusSnapshot.configured) return '待绑定'
        return assistantReady ? '待命' : '未配置'
    }
  }

  function stateTone(): string {
    if (assistantState === 'error') return 'danger'
    if (assistantState === 'pairing') return 'attention'
    if (assistantState === 'connecting' || assistantState === 'speaking') return 'active'
    if (assistantState === 'connected' || assistantReady) return 'success'
    return 'muted'
  }

  function assistantSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = localStorage.getItem('cv_token') || ''
    return `${protocol}//${window.location.host}/api/v1/assistant/stream?token=${encodeURIComponent(token)}`
  }

  function appendMessage(role: MessageRole, text: string): void {
    const normalizedText = text.trim()
    if (!normalizedText) return
    setMessages((prev) => {
      const previous = prev[prev.length - 1]
      if (role === 'user' && previous?.role === 'user' && previous.text === normalizedText) {
        return prev
      }
      return [...prev, { id: nextMessageIdRef.current++, role, text: normalizedText }].slice(-40)
    })
  }

  function sendCommand(command: Record<string, string>): void {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(command))
    }
  }

  function clearResponseWatchdog(): void {
    if (responseWatchdogRef.current !== null) {
      window.clearTimeout(responseWatchdogRef.current)
      responseWatchdogRef.current = null
    }
  }

  function refreshResponseWatchdog(): void {
    clearResponseWatchdog()
    const state = assistantStateRef.current
    if (state !== 'answering' && state !== 'speaking') return
    responseWatchdogRef.current = window.setTimeout(() => {
      if (assistantStateRef.current !== 'answering' && assistantStateRef.current !== 'speaking') return
      sendCommand({ type: 'abort', reason: 'response_timeout' })
      setAssistantState('connected')
      appendMessage('system', '助手在 45 秒内未继续响应，已停止本次会话，请重新发送问题')
    }, RESPONSE_SILENCE_TIMEOUT_MS)
  }

  async function loadStatus(): Promise<boolean> {
    setStatusLoading(true)
    try {
      const snapshot = await getAssistantStatus()
      setStatusSnapshot(snapshot)
      return true
    } catch (error) {
      appendMessage('system', error instanceof Error ? error.message : '无法读取助手状态')
      setAssistantState('error')
      return false
    } finally {
      setStatusLoading(false)
    }
  }

  function extractPairingCode(text: string): string | null {
    const match = text.match(/(?:验证码|verification code)(?:是)?\s*[：:]\s*(\d{4,8})/i)
    return match?.[1] ?? null
  }

  async function playPcmAudio(data: ArrayBuffer): Promise<void> {
    if (data.byteLength < 2) return
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    const audioContext = audioContextRef.current
    await audioContext.resume()
    const pcm = new Int16Array(data)
    const sampleRate = statusSnapshotRef.current?.output_sample_rate ?? OUTPUT_SAMPLE_RATE
    const buffer = audioContext.createBuffer(1, pcm.length, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i += 1) channel[i] = (pcm[i] ?? 0) / 32_768
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    const startAt = Math.max(audioContext.currentTime + 0.04, playbackCursorRef.current)
    source.start(startAt)
    playbackCursorRef.current = startAt + buffer.duration
  }

  function handleAssistantMessage(payload: Record<string, unknown>): void {
    if (payload.type === 'assistant') {
      const state = payload.state
      if (state === 'connecting') setAssistantState('connecting')
      if (state === 'pairing') {
        clearResponseWatchdog()
        setAssistantState('pairing')
        const code = payload.verification_code
        if (typeof code === 'string' && code !== pairingCodeRef.current) setPairingCode(code)
      }
      if (state === 'connected') {
        remoteConnectedRef.current = true
        clearResponseWatchdog()
        setAssistantState('connected')
        setPairingCode(null)
        if (statusSnapshotRef.current) {
          setStatusSnapshot({ ...statusSnapshotRef.current, configured: true, pairing_required: false })
        }
      }
      if (state === 'unavailable' || state === 'error') {
        stopMicrophone(false)
        clearResponseWatchdog()
        setAssistantState('error')
        const detail = typeof payload.message === 'string' ? payload.message : '助手暂不可用'
        appendMessage('system', `连接失败：${detail}`)
      }
      return
    }

    if (payload.type === 'stt' && typeof payload.text === 'string') {
      stopMicrophone(false)
      appendMessage('user', payload.text)
      setAssistantState('answering')
      refreshResponseWatchdog()
      return
    }

    if (payload.type === 'tts') {
      const state = payload.state
      if (state === 'start') {
        stopMicrophone(false)
        setAssistantState('speaking')
      }
      if (state === 'sentence_start' && typeof payload.text === 'string') {
        appendMessage('assistant', payload.text)
        const code = extractPairingCode(payload.text)
        if (code && code !== pairingCodeRef.current) setPairingCode(code)
        setAssistantState('speaking')
      }
      if (state === 'stop' || state === 'end' || state === 'completed') {
        clearResponseWatchdog()
        setAssistantState('connected')
        setPairingCode(null)
      }
      refreshResponseWatchdog()
    }
  }

  function handleSocketMessage(event: MessageEvent): void {
    if (typeof event.data === 'string') {
      try {
        handleAssistantMessage(JSON.parse(event.data) as Record<string, unknown>)
      } catch {
        appendMessage('system', '收到无法识别的助手消息')
      }
      return
    }
    const state = assistantStateRef.current
    if (state === 'answering' || state === 'speaking') {
      setAssistantState('speaking')
      refreshResponseWatchdog()
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then(playPcmAudio).catch(() => appendMessage('system', '语音播放失败'))
      return
    }
    if (event.data instanceof ArrayBuffer) {
      void playPcmAudio(event.data).catch(() => appendMessage('system', '语音播放失败'))
    }
  }

  function connectSocket(): Promise<void> {
    if (socketRef.current?.readyState === WebSocket.OPEN) return Promise.resolve()
    if (socketRef.current?.readyState === WebSocket.CONNECTING) {
      const pending = socketRef.current
      return new Promise((resolve, reject) => {
        pending?.addEventListener('open', () => resolve(), { once: true })
        pending?.addEventListener('error', () => reject(new Error('助手连接失败')), { once: true })
      })
    }
    const nextSocket = new WebSocket(assistantSocketUrl())
    nextSocket.binaryType = 'arraybuffer'
    socketRef.current = nextSocket
    return new Promise((resolve, reject) => {
      nextSocket.addEventListener('open', () => resolve(), { once: true })
      nextSocket.addEventListener('message', handleSocketMessage)
      nextSocket.addEventListener('error', () => {
        if (assistantStateRef.current === 'connecting') {
          reject(new Error('助手连接失败，请检查网络或服务状态'))
        }
      })
      nextSocket.addEventListener('close', () => {
        if (socketRef.current !== nextSocket) return
        socketRef.current = null
        remoteConnectedRef.current = false
        const wasRecording = recordingRef.current
        stopMicrophone(false)
        clearResponseWatchdog()
        if (wasRecording) {
          setAssistantState('error')
          appendMessage('system', '录音因助手连接中断而停止，请重新录音')
          return
        }
        const state = assistantStateRef.current
        if (state === 'connected') {
          setAssistantState('idle')
          return
        }
        if (state === 'connecting' || state === 'answering' || state === 'speaking') {
          setAssistantState('error')
          appendMessage('system', '助手会话已中断，已有对话保留，请重新发送问题')
        }
      })
    })
  }

  function waitForRemoteConnection(): Promise<void> {
    if (remoteConnectedRef.current) return Promise.resolve()
    const activeSocket = socketRef.current
    if (!activeSocket) return Promise.reject(new Error('助手连接已断开'))
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => settle(new Error('助手连接超时，请重试')), 15_000)
      function settle(error?: Error): void {
        window.clearTimeout(timeout)
        activeSocket?.removeEventListener('message', onMessage)
        activeSocket?.removeEventListener('close', onClose)
        if (error) reject(error)
        else resolve()
      }
      function onClose(): void {
        settle(new Error('助手连接已断开'))
      }
      function onMessage(event: MessageEvent): void {
        if (typeof event.data !== 'string') return
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>
          if (payload.type !== 'assistant') return
          if (payload.state === 'connected') settle()
          if (payload.state === 'pairing' || payload.state === 'unavailable' || payload.state === 'error') {
            settle(new Error('助手尚未就绪，请先完成连接或设备绑定'))
          }
        } catch {
          /* ignore */
        }
      }
      activeSocket.addEventListener('message', onMessage)
      activeSocket.addEventListener('close', onClose, { once: true })
      if (remoteConnectedRef.current) settle()
    })
  }

  async function ensureAssistantConnection(): Promise<boolean> {
    const available = statusSnapshotRef.current
      ? assistantReadyRef()
      : (await loadStatus()) && assistantReadyRef()
    if (!available) return false
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const state = assistantStateRef.current
      if (state === 'idle' || state === 'connecting') {
        if (statusSnapshotRef.current?.configured) setAssistantState('connected')
      }
      return true
    }
    setAssistantState('connecting')
    try {
      await connectSocket()
      if (statusSnapshotRef.current?.configured && assistantStateRef.current === 'connecting') {
        setAssistantState('connected')
      }
      return true
    } catch (error) {
      setAssistantState('error')
      appendMessage('system', error instanceof Error ? error.message : '无法连接 Agent助手')
      socketRef.current?.close()
      socketRef.current = null
      return false
    }
  }

  function assistantReadyRef(): boolean {
    const status = statusSnapshotRef.current
    return !!status?.enabled && (status.pairing_required || (status.configured && status.codec_available))
  }

  function stopMicrophone(submit: boolean): void {
    recordingGenerationRef.current += 1
    const wasRecording = recordingRef.current
    setRecording(false)
    setStartingRecording(false)
    microphoneProcessorRef.current?.disconnect()
    microphoneSourceRef.current?.disconnect()
    microphoneSilenceRef.current?.disconnect()
    microphoneProcessorRef.current = null
    microphoneSourceRef.current = null
    microphoneSilenceRef.current = null
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
    microphoneStreamRef.current = null
    if (microphoneContextRef.current) void microphoneContextRef.current.close()
    microphoneContextRef.current = null
    if (submit && wasRecording && socketRef.current?.readyState === WebSocket.OPEN) {
      sendCommand({ type: 'listen', state: 'stop' })
      setAssistantState('answering')
      refreshResponseWatchdog()
    }
  }

  async function toggleMicrophone(): Promise<void> {
    if (recordingRef.current) {
      stopMicrophone(true)
      return
    }
    if (startingRecordingRef.current || assistantStateRef.current === 'answering') return
    if (!navigator.mediaDevices?.getUserMedia) {
      appendMessage('system', '当前地址无法使用麦克风。请确认浏览器已将本系统地址设为安全来源并重启。')
      return
    }
    if (assistantStateRef.current === 'speaking') {
      sendCommand({ type: 'abort', reason: 'user_interruption' })
      setAssistantState('connected')
    }
    const generation = ++recordingGenerationRef.current
    setStartingRecording(true)
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      if (!(await ensureAssistantConnection()) || isPairing()) return
      await waitForRemoteConnection()
      if (generation !== recordingGenerationRef.current) return
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
      if (generation !== recordingGenerationRef.current) return
      context = new AudioContext({ sampleRate: statusSnapshotRef.current?.input_sample_rate ?? INPUT_SAMPLE_RATE })
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(2048, 1, 1)
      const silence = context.createGain()
      silence.gain.value = 0
      processor.onaudioprocess = (event) => {
        if (!recordingRef.current || socketRef.current?.readyState !== WebSocket.OPEN) return
        const samples = event.inputBuffer.getChannelData(0)
        const bytes = new ArrayBuffer(samples.length * 2)
        const pcm = new DataView(bytes)
        for (let i = 0; i < samples.length; i += 1) {
          const sample = Math.max(-1, Math.min(1, samples[i] ?? 0))
          pcm.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
        }
        socketRef.current?.send(bytes)
      }
      source.connect(processor)
      processor.connect(silence)
      silence.connect(context.destination)
      await context.resume()
      if (generation !== recordingGenerationRef.current) return
      microphoneStreamRef.current = stream
      microphoneContextRef.current = context
      microphoneSourceRef.current = source
      microphoneProcessorRef.current = processor
      microphoneSilenceRef.current = silence
      sendCommand({ type: 'listen', state: 'start', mode: 'manual' })
      setRecording(true)
      stream = null
      context = null
    } catch (error) {
      if (generation !== recordingGenerationRef.current) return
      const detail = error instanceof Error ? error.message : '无法使用麦克风'
      appendMessage('system', `录音未开始：${detail}。请检查浏览器和 Windows 麦克风权限。`)
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
      if (context) void context.close()
      if (generation === recordingGenerationRef.current) setStartingRecording(false)
    }
  }

  function isPairing(): boolean {
    return assistantStateRef.current === 'pairing'
  }

  async function submitText(): Promise<void> {
    if (
      recordingRef.current ||
      startingRecordingRef.current ||
      assistantStateRef.current === 'connecting' ||
      assistantStateRef.current === 'answering'
    ) {
      return
    }
    const text = draft.trim()
    if (!text) return
    if (assistantStateRef.current === 'speaking') {
      sendCommand({ type: 'abort', reason: 'user_interruption' })
      setAssistantState('connected')
    }
    if (!(await ensureAssistantConnection()) || isPairing()) return
    sendCommand({ type: 'listen', state: 'detect', text })
    appendMessage('user', text)
    setDraft('')
    setAssistantState('answering')
    refreshResponseWatchdog()
  }

  function disconnect(): void {
    spaceHeldRef.current = false
    stopMicrophone(false)
    remoteConnectedRef.current = false
    clearResponseWatchdog()
    sendCommand({ type: 'abort', reason: 'user_interruption' })
    socketRef.current?.close()
    socketRef.current = null
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    playbackCursorRef.current = 0
    setPairingCode(null)
    setAssistantState('idle')
  }

  function handleVoiceKeydown(event: KeyboardEvent): void {
    if (event.code !== 'Space' || !isOpenRef.current) return
    if (spaceHeldRef.current) {
      event.preventDefault()
      return
    }
    if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.defaultPrevented) {
      return
    }
    const target = event.target as HTMLElement | null
    if (target) {
      if (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')) return
      const control = target.closest('button, a, [role="button"]')
      if (control && !control.matches('.assistant-fab, .assistant-window__microphone')) return
    }
    if (
      recordingRef.current ||
      startingRecordingRef.current ||
      !assistantReadyRef() ||
      assistantStateRef.current === 'answering'
    ) {
      return
    }
    event.preventDefault()
    spaceHeldRef.current = true
    void toggleMicrophone()
  }

  function handleVoiceKeyup(event: KeyboardEvent): void {
    if (event.code !== 'Space' || !spaceHeldRef.current) return
    event.preventDefault()
    spaceHeldRef.current = false
    stopMicrophone(true)
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      spaceHeldRef.current = false
      stopMicrophone(true)
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleVoiceKeydown)
    window.addEventListener('keyup', handleVoiceKeyup)
    window.addEventListener('blur', handleVisibilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('keydown', handleVoiceKeydown)
      window.removeEventListener('keyup', handleVoiceKeyup)
      window.removeEventListener('blur', handleVisibilityChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openAssistant(): Promise<void> {
    setIsOpen(true)
    if (!statusSnapshotRef.current) await loadStatus()
    const state = assistantStateRef.current
    if (state === 'idle' || state === 'error') void ensureAssistantConnection()
  }

  function closeAssistant(): void {
    setIsOpen(false)
    disconnect()
  }

  const fab = (
    <div className={styles.float}>
      <aside
        className={`${styles.window} ${pairingCode !== null ? styles.windowPairing : ''}`}
        style={{ display: isOpen ? undefined : 'none' }}
        aria-label="AI 助手"
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.mark}><RobotOutlined /></span>
            <div>
              <strong>AI 助手</strong>
              <span className={styles.sub}>AGENT ASSISTANT</span>
            </div>
          </div>
          <span className={`${styles.state} ${styles[`state_${stateTone()}`]}`}>
            {recording ? '正在录音' : startingRecording ? '准备麦克风' : stateLabel()}
          </span>
          <button type="button" className={styles.iconBtn} aria-label="关闭 AI 助手" onClick={closeAssistant}>
            <CloseOutlined />
          </button>
        </header>

        {pairingCode !== null && (
          <div className={styles.pairing}>
            <div className={styles.pairingCopy}>
              <span>首次设备认证</span>
              <strong>输入验证码完成绑定</strong>
              <small>在设备控制面板输入验证码，完成 AI 助手认证。</small>
            </div>
            <div className={styles.pairingCode}>
              <span>设备验证码</span>
              <strong>{pairingCode}</strong>
            </div>
            <a href="https://xiaozhi.me/login" target="_blank" rel="noreferrer">
              打开控制面板 ↗
            </a>
          </div>
        )}

        <div className={styles.messages} role="log" aria-live="polite">
          {messages.length === 0 && assistantState === 'connecting' && (
            <p className={`${styles.empty} ${styles.emptyConnecting}`}>
              <LoadingOutlined className={styles.loading} />
              <span>正在安全认证</span>
              <small>连接完成后即可发送问题</small>
            </p>
          )}
          {messages.length === 0 && pairingCode !== null && (
            <p className={`${styles.empty} ${styles.emptyPairing}`}>
              <span>等待设备确认</span>
              <small>完成绑定后，助手会自动进入待命状态。</small>
            </p>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`${styles.message} ${styles[`message_${message.role}`]}`}>
              <span>{message.role === 'user' ? '操作员' : message.role === 'assistant' ? 'AI 助手' : '系统'}</span>
              <p>{message.text}</p>
            </article>
          ))}
        </div>

        <footer className={styles.footer}>
          <p className={styles.hint}>
            {recording ? '正在录音，松开空格结束并提问' : '按住空格说话，松开提问（输入框内除外）'}
          </p>
          <div className={styles.composer}>
            <input
              className={styles.textInput}
              type="text"
              maxLength={1000}
              autoComplete="off"
              placeholder="输入要查询的问题..."
              value={draft}
              disabled={statusLoading || recording || startingRecording || assistantState === 'connecting' || assistantState === 'answering'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void submitText()
                }
              }}
            />
            <button
              type="button"
              className={`${styles.micBtn} assistant-window__microphone ${recording ? styles.micBtnRecording : ''}`}
              aria-label={recording ? '结束录音并向助手提问' : '开始语音提问'}
              title="点击录音，或按住空格说话、松开提问"
              disabled={!recording && (statusLoading || startingRecording || !assistantReady || assistantState === 'answering')}
              onClick={() => void toggleMicrophone()}
            >
              {startingRecording ? <LoadingOutlined /> : recording ? <StopOutlined /> : <AudioOutlined />}
            </button>
            <button
              type="button"
              className={styles.sendBtn}
              aria-label="发送文字问题"
              disabled={statusLoading || recording || startingRecording || !assistantReady || !draft.trim() || assistantState === 'connecting' || assistantState === 'answering'}
              onClick={() => void submitText()}
            >
              <SendOutlined />
            </button>
          </div>
        </footer>
      </aside>

      <button
        type="button"
        className={`${styles.fab} assistant-fab`}
        aria-label={isOpen ? '关闭 AI 助手' : '打开 AI 助手'}
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) closeAssistant()
          else void openAssistant()
        }}
      >
        <RobotOutlined />
        <span>AI 助手</span>
      </button>
    </div>
  )

  return createPortal(fab, document.body)
}
