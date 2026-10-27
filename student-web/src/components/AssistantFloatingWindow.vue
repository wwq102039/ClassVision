<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bot, LoaderCircle, Mic, Radio, Send, Square, X } from 'lucide-vue-next'
import { useRoute } from 'vue-router'

interface AssistantStatusSnapshot {
  enabled: boolean
  configured: boolean
  pairing_required: boolean
  codec_available: boolean
  device_id: string | null
  client_id: string | null
  endpoint_host: string | null
  input_sample_rate: number
  output_sample_rate: number
  frame_duration_ms: number
}

type AssistantState = 'idle' | 'connecting' | 'pairing' | 'connected' | 'answering' | 'speaking' | 'error'
type MessageRole = 'user' | 'assistant' | 'system'

interface ChatMessage {
  id: number
  role: MessageRole
  text: string
}

interface AssistantPosition {
  x: number
  y: number
}

const isOpen = ref(false)
const route = useRoute()
const draft = ref('')

const assistantVisible = computed(
  () => route.path !== '/login' && Boolean(localStorage.getItem('cv_token')),
)

const positionStorageKey = 'cv-assistant-position'
const assistantPosition = ref<AssistantPosition | null>(loadAssistantPosition())

function loadAssistantPosition(): AssistantPosition | null {
  try {
    const raw = localStorage.getItem(positionStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AssistantPosition
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed
  } catch {
    /* 忽略损坏的位置数据 */
  }
  return null
}

function setAssistantPosition(position: AssistantPosition): void {
  assistantPosition.value = position
  try {
    localStorage.setItem(positionStorageKey, JSON.stringify(position))
  } catch {
    /* 忽略存储失败 */
  }
}
const assistantState = ref<AssistantState>('idle')
const statusSnapshot = ref<AssistantStatusSnapshot | null>(null)
const messages = ref<ChatMessage[]>([])
const messageListElement = ref<HTMLElement | null>(null)
const pairingCode = ref<string | null>(null)
const statusLoading = ref(false)
const recording = ref(false)
const startingRecording = ref(false)
const spaceHeld = ref(false)

let socket: WebSocket | null = null
let audioContext: AudioContext | null = null
let playbackCursor = 0
let nextMessageId = 1
let responseWatchdog: number | null = null
let microphoneStream: MediaStream | null = null
let microphoneContext: AudioContext | null = null
let microphoneProcessor: ScriptProcessorNode | null = null
let microphoneSource: MediaStreamAudioSourceNode | null = null
let microphoneSilence: GainNode | null = null
let remoteConnected = false
let recordingGeneration = 0

const responseSilenceTimeoutMs = 45_000

const assistantReady = computed(() => {
  const status = statusSnapshot.value
  return Boolean(status?.enabled && (status.pairing_required || (status.configured && status.codec_available)))
})

const stateLabel = computed(() => {
  switch (assistantState.value) {
    case 'connecting':
      // 设备认证和当前问答链路是两个独立状态。后端状态接口已经确认
      // 凭据有效时，远端 WebSocket 握手不应让顶部状态退回“连接中”。
      return statusSnapshot.value?.configured ? '设备已认证' : '连接中'
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
      // 连接成功后，后端已经用当前 WebSocket 会话完成认证；此时旧的
      // status 快照可能仍保留 pairing_required=true，不能继续显示待绑定。
      if (statusSnapshot.value?.pairing_required && !statusSnapshot.value.configured) {
        return '待绑定'
      }
      return assistantReady.value ? '待命' : '未配置'
  }
})

const stateTone = computed(() => {
  if (assistantState.value === 'error') return 'danger'
  if (assistantState.value === 'pairing') return 'attention'
  if (assistantState.value === 'connecting') return 'active'
  if (assistantState.value === 'speaking') return 'active'
  if (assistantState.value === 'connected' || assistantReady.value) return 'success'
  return 'muted'
})

function assistantSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = localStorage.getItem('cv_token') ?? ''
  return `${protocol}//${window.location.host}/api/v1/assistant/stream?token=${encodeURIComponent(token)}`
}

async function loadStatus(): Promise<boolean> {
  statusLoading.value = true
  try {
    const response = await fetch('/api/v1/assistant/status', {
      headers: { Authorization: `Bearer ${localStorage.getItem('cv_token') ?? ''}` },
    })
    if (!response.ok) throw new Error('无法读取 Agent助手设备认证状态')
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('当前后端尚未部署 Agent助手接口')
    }
    statusSnapshot.value = (await response.json()) as AssistantStatusSnapshot
    return true
  } catch (error) {
    appendMessage('system', error instanceof Error ? error.message : '无法读取助手状态')
    assistantState.value = 'error'
    return false
  } finally {
    statusLoading.value = false
  }
}

function scrollMessagesToBottom(): void {
  void nextTick(() => {
    const element = messageListElement.value
    if (!element) return
    element.scrollTop = element.scrollHeight
  })
}

function appendMessage(role: MessageRole, text: string): void {
  const normalizedText = text.trim()
  if (!normalizedText) return

  const previousMessage = messages.value.at(-1)
  if (role === 'user' && previousMessage?.role === 'user' && previousMessage.text === normalizedText) return

  messages.value = [...messages.value, { id: nextMessageId++, role, text: normalizedText }].slice(-40)
  scrollMessagesToBottom()
}

function isPairingState(): boolean {
  return assistantState.value === 'pairing'
}

function sendCommand(command: Record<string, string>): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command))
}

function clearResponseWatchdog(): void {
  if (responseWatchdog === null) return
  window.clearTimeout(responseWatchdog)
  responseWatchdog = null
}

function refreshResponseWatchdog(): void {
  clearResponseWatchdog()
  if (assistantState.value !== 'answering' && assistantState.value !== 'speaking') return
  responseWatchdog = window.setTimeout(() => {
    if (assistantState.value !== 'answering' && assistantState.value !== 'speaking') return
    sendCommand({ type: 'abort', reason: 'response_timeout' })
    assistantState.value = 'connected'
    appendMessage('system', '助手在 45 秒内未继续响应，已停止本次会话，请重新发送问题')
  }, responseSilenceTimeoutMs)
}

function connectSocket(): Promise<void> {
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve()
  if (socket?.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve, reject) => {
      const pendingSocket = socket
      if (!pendingSocket) {
        reject(new Error('助手连接未创建'))
        return
      }
      pendingSocket.addEventListener('open', () => resolve(), { once: true })
      pendingSocket.addEventListener('error', () => reject(new Error('助手连接失败')), { once: true })
    })
  }

  const nextSocket = new WebSocket(assistantSocketUrl())
  nextSocket.binaryType = 'arraybuffer'
  socket = nextSocket
  return new Promise((resolve, reject) => {
    nextSocket.addEventListener('open', () => resolve(), { once: true })
    nextSocket.addEventListener('message', handleSocketMessage)
    nextSocket.addEventListener('error', () => {
      if (assistantState.value === 'connecting') reject(new Error('助手连接失败，请检查网络或服务状态'))
    })
    nextSocket.addEventListener('close', () => {
      if (socket !== nextSocket) return
      socket = null
      remoteConnected = false
      const wasRecording = recording.value
      stopMicrophone(false)
      clearResponseWatchdog()
      if (wasRecording) {
        assistantState.value = 'error'
        appendMessage('system', '录音因助手连接中断而停止，请重新录音')
        return
      }
      // 空闲会话结束不代表设备认证失效；下一条问题会按需重新建立连接。
      if (assistantState.value === 'connected') {
        assistantState.value = 'idle'
        return
      }
      if (
        assistantState.value === 'connecting'
        || assistantState.value === 'answering'
        || assistantState.value === 'speaking'
      ) {
        assistantState.value = 'error'
        appendMessage('system', '助手会话已中断，已有对话保留，请重新发送问题')
      }
    })
  })
}

function waitForRemoteConnection(): Promise<void> {
  if (remoteConnected) return Promise.resolve()
  const activeSocket = socket
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
    function onClose(): void { settle(new Error('助手连接已断开')) }
    function onMessage(event: MessageEvent): void {
      if (typeof event.data !== 'string') return
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>
        if (payload.type !== 'assistant') return
        if (payload.state === 'connected') settle()
        if (payload.state === 'pairing' || payload.state === 'unavailable' || payload.state === 'error') {
          settle(new Error('助手尚未就绪，请先完成连接或设备绑定'))
        }
      } catch { /* Other protocol messages are handled by the normal listener. */ }
    }
    activeSocket.addEventListener('message', onMessage)
    activeSocket.addEventListener('close', onClose, { once: true })
    if (remoteConnected) settle()
  })
}

async function ensureAssistantConnection(): Promise<boolean> {
  const available = statusSnapshot.value
    ? assistantReady.value
    : (await loadStatus()) && assistantReady.value
  if (!available) return false
  if (socket?.readyState === WebSocket.OPEN) {
    if (assistantState.value === 'idle' || assistantState.value === 'connecting') {
      assistantState.value = statusSnapshot.value?.configured ? 'connected' : assistantState.value
    }
    return true
  }

  assistantState.value = 'connecting'
  try {
    await connectSocket()
    // 状态接口已经确认设备凭据有效，浏览器到后端的连接建立后即可显示认证；
    // 远端真正拒绝时，后续 error 消息会覆盖这个状态。
    if (statusSnapshot.value?.configured && assistantState.value === 'connecting') {
      assistantState.value = 'connected'
    }
    return true
  } catch (error) {
    assistantState.value = 'error'
    appendMessage('system', error instanceof Error ? error.message : '无法连接 Agent助手')
    socket?.close()
    socket = null
    return false
  }
}

async function playPcmAudio(data: ArrayBuffer): Promise<void> {
  if (data.byteLength < 2) return
  audioContext ??= new AudioContext()
  await audioContext.resume()
  const pcm = new Int16Array(data)
  const sampleRate = statusSnapshot.value?.output_sample_rate ?? 24_000
  const buffer = audioContext.createBuffer(1, pcm.length, sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < pcm.length; index += 1) channel[index] = (pcm[index] ?? 0) / 32_768
  const source = audioContext.createBufferSource()
  source.buffer = buffer
  source.connect(audioContext.destination)
  const startAt = Math.max(audioContext.currentTime + 0.04, playbackCursor)
  source.start(startAt)
  playbackCursor = startAt + buffer.duration
}

function extractPairingCode(text: string): string | null {
  const match = text.match(/(?:验证码|verification code)(?:是)?\s*[：:]\s*(\d{4,8})/i)
  return match?.[1] ?? null
}

function handleAssistantMessage(payload: Record<string, unknown>): void {
  if (payload.type === 'assistant') {
    const state = payload.state
    if (state === 'connecting') assistantState.value = 'connecting'
    if (state === 'pairing') {
      clearResponseWatchdog()
      assistantState.value = 'pairing'
      const code = payload.verification_code
      if (typeof code === 'string' && code !== pairingCode.value) {
        pairingCode.value = code
      }
    }
    if (state === 'connected') {
      remoteConnected = true
      clearResponseWatchdog()
      assistantState.value = 'connected'
      pairingCode.value = null
      // provisioning 得到的运行时 token 只保存在后端，本次连接的 connected
      // 消息是认证成功的事实来源。同步修正打开窗口时读取的旧状态快照。
      if (statusSnapshot.value) {
        statusSnapshot.value = {
          ...statusSnapshot.value,
          configured: true,
          pairing_required: false,
        }
      }
    }
    if (state === 'unavailable' || state === 'error') {
      stopMicrophone(false)
      clearResponseWatchdog()
      assistantState.value = 'error'
      const detail = typeof payload.message === 'string' ? payload.message : '助手暂不可用'
      appendMessage('system', `连接失败：${detail}`)
    }
    return
  }

  if (payload.type === 'stt' && typeof payload.text === 'string') {
    stopMicrophone(false)
    appendMessage('user', payload.text)
    assistantState.value = 'answering'
    refreshResponseWatchdog()
    return
  }

  if (payload.type === 'tts') {
    const state = payload.state
    if (state === 'start') stopMicrophone(false)
    if (state === 'stop' || state === 'end' || state === 'completed') {
      clearResponseWatchdog()
      assistantState.value = 'connected'
      pairingCode.value = null
      return
    }
    if (state === 'start') assistantState.value = 'speaking'
    if (payload.state === 'sentence_start' && typeof payload.text === 'string') {
      const text = payload.text
      appendMessage('assistant', text)
      const code = extractPairingCode(text)
      if (code && code !== pairingCode.value) {
        pairingCode.value = code
      }
      assistantState.value = 'speaking'
    }
    refreshResponseWatchdog()
  }
}

function handleSocketMessage(event: MessageEvent<ArrayBuffer | string | Blob>): void {
  if (typeof event.data === 'string') {
    try {
      handleAssistantMessage(JSON.parse(event.data) as Record<string, unknown>)
    } catch {
      appendMessage('system', '收到无法识别的助手消息')
    }
    return
  }
  if (assistantState.value === 'answering' || assistantState.value === 'speaking') {
    assistantState.value = 'speaking'
    refreshResponseWatchdog()
  }
  if (event.data instanceof Blob) {
    void event.data.arrayBuffer().then(playPcmAudio).catch(() => appendMessage('system', '语音播放失败'))
    return
  }
  void playPcmAudio(event.data).catch(() => appendMessage('system', '语音播放失败'))
}

async function submitText(): Promise<void> {
  if (recording.value || startingRecording.value || assistantState.value === 'connecting' || assistantState.value === 'answering') return
  const text = draft.value.trim()
  if (!text) return
  if (assistantState.value === 'speaking') {
    sendCommand({ type: 'abort', reason: 'user_interruption' })
    assistantState.value = 'connected'
  }

  if (!(await ensureAssistantConnection()) || isPairingState()) return
  sendCommand({ type: 'listen', state: 'detect', text })
  appendMessage('user', text)
  draft.value = ''
  assistantState.value = 'answering'
  refreshResponseWatchdog()
}

function stopMicrophone(submit: boolean): void {
  recordingGeneration += 1
  const wasRecording = recording.value
  recording.value = false
  startingRecording.value = false
  microphoneProcessor?.disconnect()
  microphoneSource?.disconnect()
  microphoneSilence?.disconnect()
  microphoneProcessor = null
  microphoneSource = null
  microphoneSilence = null
  microphoneStream?.getTracks().forEach((track) => track.stop())
  microphoneStream = null
  if (microphoneContext) void microphoneContext.close()
  microphoneContext = null
  if (submit && wasRecording && socket?.readyState === WebSocket.OPEN) {
    sendCommand({ type: 'listen', state: 'stop' })
    assistantState.value = 'answering'
    refreshResponseWatchdog()
  }
}

async function toggleMicrophone(): Promise<void> {
  if (recording.value) {
    stopMicrophone(true)
    return
  }
  if (startingRecording.value || assistantState.value === 'answering') return
  if (!navigator.mediaDevices?.getUserMedia) {
    appendMessage('system', '当前地址无法使用麦克风。请确认浏览器已将本系统地址设为安全来源并重启。')
    return
  }
  if (assistantState.value === 'speaking') {
    sendCommand({ type: 'abort', reason: 'user_interruption' })
    assistantState.value = 'connected'
  }
  const generation = ++recordingGeneration
  startingRecording.value = true
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  try {
    if (!(await ensureAssistantConnection()) || isPairingState()) return
    await waitForRemoteConnection()
    if (generation !== recordingGeneration) return
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
    if (generation !== recordingGeneration) return
    context = new AudioContext({ sampleRate: statusSnapshot.value?.input_sample_rate ?? 16_000 })
    const source = context.createMediaStreamSource(stream)
    const processor = context.createScriptProcessor(2048, 1, 1)
    const silence = context.createGain()
    silence.gain.value = 0
    processor.onaudioprocess = (event) => {
      if (!recording.value || socket?.readyState !== WebSocket.OPEN) return
      const samples = event.inputBuffer.getChannelData(0)
      const bytes = new ArrayBuffer(samples.length * 2)
      const pcm = new DataView(bytes)
      for (let index = 0; index < samples.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
        pcm.setInt16(index * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
      }
      socket.send(bytes)
    }
    source.connect(processor)
    processor.connect(silence)
    silence.connect(context.destination)
    await context.resume()
    if (generation !== recordingGeneration) return
    microphoneStream = stream
    microphoneContext = context
    microphoneSource = source
    microphoneProcessor = processor
    microphoneSilence = silence
    sendCommand({ type: 'listen', state: 'start', mode: 'manual' })
    recording.value = true
    stream = null
    context = null
  } catch (error) {
    if (generation !== recordingGeneration) return
    const detail = error instanceof Error ? error.message : '无法使用麦克风'
    appendMessage('system', `录音未开始：${detail}。请检查浏览器和 Windows 麦克风权限。`)
  } finally {
    stream?.getTracks().forEach((track) => track.stop())
    if (context) void context.close()
    if (generation === recordingGeneration) startingRecording.value = false
  }
}

function handleVoiceKeydown(event: KeyboardEvent): void {
  if (event.code !== 'Space' || !isOpen.value || !assistantVisible.value) return
  if (spaceHeld.value) {
    event.preventDefault()
    return
  }
  if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.defaultPrevented) return
  const target = event.target
  if (target instanceof HTMLElement) {
    if (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')) return
    // 悬浮入口仍会保留点击后的焦点；面板展开时允许在入口和麦克风上按住说话。
    const control = target.closest('button, a, [role="button"]')
    if (control && !control.matches('.assistant-fab, .assistant-window__microphone')) return
  }
  if (recording.value || startingRecording.value || statusLoading.value || !assistantReady.value || assistantState.value === 'answering') return
  event.preventDefault()
  spaceHeld.value = true
  void toggleMicrophone()
}

function finishSpaceRecording(): void {
  if (!spaceHeld.value) return
  spaceHeld.value = false
  // 也取消等待连接、权限或 AudioContext 的启动过程。
  stopMicrophone(true)
}

function handleVoiceKeyup(event: KeyboardEvent): void {
  if (event.code !== 'Space' || !spaceHeld.value) return
  event.preventDefault()
  finishSpaceRecording()
}

function handleVoiceVisibilityChange(): void {
  if (document.hidden) finishSpaceRecording()
}

function disconnect(): void {
  spaceHeld.value = false
  stopMicrophone(false)
  remoteConnected = false
  clearResponseWatchdog()
  sendCommand({ type: 'abort', reason: 'user_interruption' })
  socket?.close()
  socket = null
  if (audioContext) {
    void audioContext.close()
    audioContext = null
  }
  playbackCursor = 0
  pairingCode.value = null
  assistantState.value = 'idle'
}

const dragMargin = 8
const dragThreshold = 3
const keyboardStep = 16
const keyboardStepLarge = 64
const dragAxes: Record<string, AssistantPosition> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

const floatingElement = ref<HTMLElement | null>(null)
const windowElement = ref<HTMLElement | null>(null)
const dragPointerId = ref<number | null>(null)
const dragOrigin = ref<AssistantPosition>({ x: 0, y: 0 })
const dragOffset = ref<AssistantPosition>({ x: 0, y: 0 })
const dragPosition = ref<AssistantPosition | null>(null)
const dragMoved = ref(false)

// 拖拽过程中只更新内存中的位置，落库推迟到 pointerup，避免每帧写 localStorage 造成卡顿。
// 位置始终锚定在悬浮按钮；弹窗向上展开，避免打开后按钮跳位。
const floatingStyle = computed<Record<string, string> | undefined>(() => {
  const position = dragPosition.value ?? assistantPosition.value
  if (!position) return undefined
  return { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }
})

function clampFloatingPosition(position: AssistantPosition): AssistantPosition {
  const button = floatingElement.value
  const panel = windowElement.value
  const buttonWidth = button?.offsetWidth ?? 0
  const buttonHeight = button?.offsetHeight ?? 0
  const panelWidth = isOpen.value ? panel?.offsetWidth ?? 0 : 0
  const panelHeight = isOpen.value ? panel?.offsetHeight ?? 0 : 0
  const minX = isOpen.value
    ? Math.max(dragMargin, dragMargin + panelWidth - buttonWidth)
    : dragMargin
  const minY = isOpen.value ? dragMargin + panelHeight + dragMargin : dragMargin
  const maxX = Math.max(minX, window.innerWidth - buttonWidth - dragMargin)
  const maxY = Math.max(minY, window.innerHeight - buttonHeight - dragMargin)
  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  }
}

function applyFloatingPosition(position: AssistantPosition, persist: boolean): void {
  if (!floatingElement.value) return
  const clamped = clampFloatingPosition(position)
  if (!persist) {
    dragPosition.value = clamped
    return
  }
  dragPosition.value = null
  setAssistantPosition(clamped)
}

function handleFloatingPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  // 只放行落在拖拽手柄上的按下：手柄内部的图标/文字不算，手柄内的按钮、链接、输入框要照常点击。
  const interactive = (event.target as HTMLElement).closest('button, a, input, textarea, select')
  if (interactive && interactive !== handle) return
  const rect = floatingElement.value?.getBoundingClientRect()
  if (!rect) return
  dragPointerId.value = event.pointerId
  dragOrigin.value = { x: event.clientX, y: event.clientY }
  dragOffset.value = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  dragPosition.value = null
  dragMoved.value = false
  handle.setPointerCapture(event.pointerId)
}

function handleFloatingPointerMove(event: PointerEvent): void {
  if (dragPointerId.value !== event.pointerId) return
  if (!dragMoved.value) {
    const travelled = Math.hypot(
      event.clientX - dragOrigin.value.x,
      event.clientY - dragOrigin.value.y,
    )
    if (travelled <= dragThreshold) return
    dragMoved.value = true
  }
  applyFloatingPosition(
    { x: event.clientX - dragOffset.value.x, y: event.clientY - dragOffset.value.y },
    false,
  )
}

function handleFloatingPointerEnd(event: PointerEvent): void {
  if (dragPointerId.value !== event.pointerId) return
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  dragPointerId.value = null
  if (dragPosition.value) applyFloatingPosition(dragPosition.value, true)
}

function handleFloatingKeydown(event: KeyboardEvent): void {
  const axis = dragAxes[event.key]
  if (!axis) return
  const rect = floatingElement.value?.getBoundingClientRect()
  if (!rect) return
  const step = event.shiftKey ? keyboardStepLarge : keyboardStep
  event.preventDefault()
  applyFloatingPosition({ x: rect.left + axis.x * step, y: rect.top + axis.y * step }, true)
}

function handleFabClick(event: MouseEvent): void {
  const wasDragged = dragMoved.value
  dragMoved.value = false
  // 键盘激活（Enter/Space）的 click 没有指针坐标，不能按拖拽处理，否则会吞掉键盘打开。
  if (wasDragged && event.detail > 0) return
  if (isOpen.value) {
    closeAssistant()
    return
  }
  void openAssistant()
}

function keepFloatingInViewport(): void {
  const position = assistantPosition.value
  if (position) applyFloatingPosition(position, true)
}

onMounted(async () => {
  window.addEventListener('keydown', handleVoiceKeydown)
  window.addEventListener('keyup', handleVoiceKeyup)
  window.addEventListener('blur', finishSpaceRecording)
  document.addEventListener('visibilitychange', handleVoiceVisibilityChange)
  window.addEventListener('resize', keepFloatingInViewport)
  await nextTick()
  keepFloatingInViewport()
  scrollMessagesToBottom()
  // 组件加载即预连接，避免首条问题承担设备认证和远端握手延迟。
  if (assistantVisible.value) void ensureAssistantConnection()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleVoiceKeydown)
  window.removeEventListener('keyup', handleVoiceKeyup)
  window.removeEventListener('blur', finishSpaceRecording)
  document.removeEventListener('visibilitychange', handleVoiceVisibilityChange)
  window.removeEventListener('resize', keepFloatingInViewport)
})

async function openAssistant(): Promise<void> {
  isOpen.value = true
  if (!statusSnapshot.value) await loadStatus()
  if (assistantState.value === 'idle' || assistantState.value === 'error') {
    void ensureAssistantConnection()
  }
  await nextTick()
  scrollMessagesToBottom()
}

function closeAssistant(): void {
  isOpen.value = false
  disconnect()
}

watch(assistantVisible, (visible) => {
  if (!visible) closeAssistant()
})

// 面板比收起状态的按钮更大，展开后按新尺寸重新夹取，避免越出视口。
watch(isOpen, async (open) => {
  if (!open) return
  await nextTick()
  keepFloatingInViewport()
  scrollMessagesToBottom()
})

onBeforeUnmount(disconnect)
</script>

<style>
.assistant-float {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --header-height: 4rem;

  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-surface-overlay: #ffffff;
  --color-text: #262626;
  --color-text-secondary: #595959;
  --color-text-tertiary: #8c8c8c;
  --color-border: #f0f0f0;
  --color-border-strong: #e5e6eb;

  --color-cyan: #1890ff;
  --color-mint: #52c41a;
  --color-red: #ff4d4f;
  --color-warning: #faad14;
  --color-orange: #fa8c16;
  --color-active-faint: rgba(24, 144, 255, 0.06);

  --font-data: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-reading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  --font-size-label-small: 12px;
  --font-size-title-small: 15px;
  --font-size-body-small: 13px;
  --font-size-headline-small: 22px;

  --motion-fast: 150ms;
}
</style>

<template>
  <div
    v-if="assistantVisible"
    ref="floatingElement"
    class="assistant-float"
    :style="floatingStyle"
  >
    <aside
      v-if="isOpen"
      ref="windowElement"
      class="assistant-window"
      :class="{
        'assistant-window--dragging': dragPointerId !== null,
        'assistant-window--pairing': pairingCode !== null,
      }"
      aria-label="Agent助手"
      @keydown.escape="closeAssistant"
    >
    <header
      class="assistant-window__header"
      tabindex="0"
      aria-label="拖拽移动 Agent助手窗口，可用方向键微调"
      title="拖拽移动"
      @pointerdown="handleFloatingPointerDown"
      @pointermove="handleFloatingPointerMove"
      @pointerup="handleFloatingPointerEnd"
      @pointercancel="handleFloatingPointerEnd"
      @keydown="handleFloatingKeydown"
    >
      <div class="assistant-window__identity">
        <span class="assistant-window__mark" aria-hidden="true"><Bot :size="18" :stroke-width="1.8" /></span>
        <div>
          <strong>Agent助手</strong>
          <span class="data-label">AGENT ASSISTANT</span>
        </div>
      </div>
      <span class="assistant-window__state" :class="`assistant-window__state--${recording ? 'attention' : stateTone}`" role="status" aria-live="polite">
        <Radio :size="13" aria-hidden="true" />
        {{ recording ? '正在录音' : startingRecording ? '准备麦克风' : stateLabel }}
      </span>
      <button type="button" class="assistant-window__close" aria-label="关闭 Agent助手" @click="closeAssistant">
        <X :size="17" aria-hidden="true" />
      </button>
    </header>

    <div
      v-if="pairingCode"
      class="assistant-window__pairing"
      role="alert"
      aria-labelledby="assistant-pairing-title"
    >
      <div class="assistant-window__pairing-copy">
        <span>首次设备认证</span>
        <strong id="assistant-pairing-title">输入验证码完成绑定</strong>
        <small>在设备控制面板输入验证码，完成 Agent助手认证。</small>
      </div>
      <div class="assistant-window__pairing-code">
        <span>设备验证码</span>
        <strong>{{ pairingCode }}</strong>
      </div>
      <a href="https://xiaozhi.me/login" target="_blank" rel="noreferrer" aria-label="打开设备控制面板">
        打开控制面板 <span aria-hidden="true">↗</span>
      </a>
    </div>

    <div ref="messageListElement" class="assistant-window__messages" role="log" aria-live="polite" aria-label="问答记录">
      <p v-if="!messages.length && assistantState === 'connecting'" class="assistant-window__empty assistant-window__empty--connecting" role="status">
        <LoaderCircle class="assistant-window__loading" :size="22" aria-hidden="true" />
        <span>正在安全认证</span>
        <small>连接完成后即可发送问题</small>
      </p>
      <p v-else-if="!messages.length && pairingCode" class="assistant-window__empty assistant-window__empty--pairing" role="status">
        <span>等待设备确认</span>
        <small>完成绑定后，助手会自动进入待命状态。</small>
      </p>
      <article v-for="message in messages" :key="message.id" class="assistant-message" :class="`assistant-message--${message.role}`">
        <span>{{ message.role === 'user' ? '操作员' : message.role === 'assistant' ? 'Agent助手' : '系统' }}</span>
        <p>{{ message.text }}</p>
      </article>
    </div>

    <footer class="assistant-window__footer">
      <p v-if="recording" class="assistant-window__recording-hint" role="status">{{ spaceHeld ? '正在录音，松开空格结束并提问' : '正在录音，再次点击麦克风结束并提问' }}</p>
      <p v-else class="assistant-window__voice-hint">按住空格说话，松开提问（输入框内除外）</p>
      <form class="assistant-window__composer" @submit.prevent="submitText">
        <label class="sr-only" for="assistant-text-input">输入要查询的课堂考勤问题</label>
        <input
          id="assistant-text-input"
          v-model="draft"
          class="assistant-window__text-input"
          type="text"
          maxlength="1000"
          autocomplete="off"
          placeholder="输入要查询的问题..."
          :disabled="statusLoading || recording || startingRecording || assistantState === 'connecting' || assistantState === 'answering'"
        />
        <button
          type="button"
          class="assistant-window__microphone"
          :class="{ 'assistant-window__microphone--recording': recording }"
          :aria-label="recording ? '结束录音并向助手提问' : '开始语音提问'"
          :aria-pressed="recording"
          aria-keyshortcuts="Space"
          title="点击录音，或按住空格说话、松开提问"
          :disabled="!recording && (statusLoading || startingRecording || !assistantReady || assistantState === 'answering')"
          @click="toggleMicrophone"
        >
          <LoaderCircle v-if="startingRecording" class="assistant-window__loading" :size="17" aria-hidden="true" />
          <Square v-else-if="recording" :size="16" aria-hidden="true" />
          <Mic v-else :size="17" aria-hidden="true" />
        </button>
        <button
          type="submit"
          class="assistant-window__send"
          aria-label="发送文字问题"
          :disabled="statusLoading || recording || startingRecording || !assistantReady || !draft.trim() || assistantState === 'connecting' || assistantState === 'answering'"
        >
          <Send :size="17" aria-hidden="true" />
        </button>
      </form>
    </footer>
  </aside>

    <button
      type="button"
      class="assistant-fab"
      :class="{ 'assistant-fab--dragging': dragPointerId !== null }"
      :aria-label="isOpen ? '关闭 Agent助手' : '打开 Agent助手，可拖拽移动，聚焦后按方向键微调'"
      :aria-expanded="isOpen"
    @pointerdown="handleFloatingPointerDown"
    @pointermove="handleFloatingPointerMove"
    @pointerup="handleFloatingPointerEnd"
    @pointercancel="handleFloatingPointerEnd"
    @keydown="handleFloatingKeydown"
    @click="handleFabClick"
  >
    <Bot :size="21" :stroke-width="1.8" aria-hidden="true" />
    <span>Agent助手</span>
  </button>
  </div>
</template>

<style scoped>
.assistant-float {
  position: fixed;
  z-index: 30;
  right: var(--space-5);
  bottom: var(--space-5);
  display: inline-block;
  width: max-content;
}

.assistant-fab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 2.8rem;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-cyan);
  color: var(--color-cyan);
  background: var(--color-surface-overlay);
  font-family: var(--font-data);
  font-size: var(--font-size-label-small);
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: grab;
  touch-action: none;
  user-select: none;
  box-shadow: 0 10px 28px rgb(0 0 0 / 20%);
  transition: background var(--motion-fast) ease, color var(--motion-fast) ease;
}

.assistant-fab--dragging {
  cursor: grabbing;
}

.assistant-fab:hover {
  color: var(--color-bg);
  background: var(--color-cyan);
}

.assistant-window {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: calc(100% + var(--space-2));
  display: grid;
  grid-template-rows: auto minmax(14rem, 1fr) auto;
  width: min(25rem, calc(100vw - 2rem));
  max-height: min(38rem, calc(100vh - var(--header-height) - 6rem));
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-overlay);
  box-shadow: 0 18px 48px rgb(0 0 0 / 28%);
}
.assistant-window--pairing {
  grid-template-rows: auto auto minmax(10rem, 1fr) auto;
}

.assistant-window__header,
.assistant-window__footer {
  display: flex;
  align-items: center;
}

.assistant-window__header {
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.assistant-window__header:focus-visible {
  outline: 1px solid var(--color-cyan);
  outline-offset: -1px;
}

.assistant-window--dragging .assistant-window__header {
  cursor: grabbing;
}

.assistant-window__identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.assistant-window__identity > div {
  display: grid;
  gap: 0.2rem;
}

.assistant-window__identity strong {
  font-size: var(--font-size-title-small);
}

.assistant-window__state {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  color: var(--color-text-secondary);
  font-family: var(--font-data);
  font-size: var(--font-size-label-small);
  white-space: nowrap;
}

.assistant-window__state--active {
  color: var(--color-cyan);
}

.assistant-window__state--success {
  color: var(--color-mint);
}

.assistant-window__state--danger {
  color: var(--color-red);
}

.assistant-window__state--attention {
  color: var(--color-warning);
}

.assistant-window__mark {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--color-cyan);
  color: var(--color-cyan);
}

.assistant-window__close {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
}

.assistant-window__close:hover {
  color: var(--color-text);
  border-color: var(--color-cyan);
}

.assistant-window__pairing {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "copy code"
    "action action";
  align-items: end;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  border-left: 3px solid var(--color-warning);
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 5%, var(--color-surface));
}

.assistant-window__pairing-copy {
  display: grid;
  grid-area: copy;
  gap: 0.35rem;
  min-width: 0;
}

.assistant-window__pairing-copy > span,
.assistant-window__pairing-code > span {
  color: var(--color-warning);
  font-family: var(--font-data);
  font-size: var(--font-size-label-small);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.assistant-window__pairing-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-title-small);
}

.assistant-window__pairing-copy small {
  color: var(--color-text-secondary);
  font-family: var(--font-reading);
  line-height: 1.55;
}

.assistant-window__pairing-code {
  display: grid;
  grid-area: code;
  justify-items: end;
  gap: 0.2rem;
}

.assistant-window__pairing-code strong {
  color: var(--color-text);
  font-family: var(--font-data);
  font-size: var(--font-size-headline-small);
  font-weight: 700;
  letter-spacing: 0.16em;
  line-height: 1;
}

.assistant-window__pairing a {
  display: inline-flex;
  grid-area: action;
  align-items: center;
  justify-self: start;
  gap: 0.4rem;
  min-height: 2.25rem;
  padding: 0 var(--space-3);
  border: 1px solid color-mix(in srgb, var(--color-cyan) 70%, var(--color-border));
  color: var(--color-cyan);
  font-family: var(--font-data);
  font-size: var(--font-size-label-small);
  text-decoration: none;
}

.assistant-window__pairing a:hover {
  color: var(--color-bg);
  background: var(--color-cyan);
}

.assistant-window__pairing a:focus-visible {
  outline: 1px solid var(--color-cyan);
  outline-offset: 2px;
}

.assistant-window__empty--pairing {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 2.5rem var(--space-4);
  border: 1px dashed color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-warning) 4%, transparent);
}

.assistant-window__empty--pairing span {
  color: var(--color-warning);
  font-family: var(--font-data);
}

.assistant-window__empty--pairing small {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-label-small);
}


.assistant-window__messages {
  overflow-y: auto;
  padding: var(--space-4);
  background: var(--color-bg);
}

.assistant-window__empty {
  margin: 2rem 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-body-small);
  line-height: 1.7;
  text-align: center;
}

.assistant-window__empty--connecting {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 5rem var(--space-4);
  color: var(--color-cyan);
  border: 1px dashed color-mix(in srgb, var(--color-cyan) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-cyan) 4%, transparent);
}

.assistant-window__empty--connecting small {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-label-small);
}

.assistant-window__loading {
  animation: assistant-spin 1.1s linear infinite;
}

@keyframes assistant-spin {
  to { transform: rotate(360deg); }
}

.assistant-message {
  max-width: 88%;
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border-left: 2px solid var(--color-border-strong);
  background: var(--color-surface);
}

.assistant-message > span {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--color-text-tertiary);
  font-family: var(--font-data);
  font-size: var(--font-size-label-small);
}

.assistant-message p {
  margin: 0;
  font-size: var(--font-size-body-small);
  line-height: 1.55;
  white-space: pre-wrap;
}

.assistant-message--user {
  margin-left: auto;
  border-left: 0;
  border-right: 2px solid var(--color-cyan);
  background: var(--color-active-faint);
  text-align: right;
}

.assistant-message--user > span {
  color: var(--color-cyan);
}

.assistant-message--assistant {
  border-left-color: var(--color-mint);
}

.assistant-message--assistant > span {
  color: var(--color-mint);
}

.assistant-message--system {
  border-left-color: var(--color-orange);
}

.assistant-message--system > span {
  color: var(--color-orange);
}

.assistant-window__footer {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.assistant-window__composer {
  display: flex;
  gap: var(--space-2);
}

.assistant-window__recording-hint {
  margin: 0;
  color: var(--color-warning);
  font-family: var(--font-data);
  font-size: var(--font-size-label-small);
}

.assistant-window__voice-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-family: var(--font-data);
  font-size: var(--font-size-label-small);
}

.assistant-window__microphone {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 2.8rem;
  border: 1px solid var(--color-cyan);
  color: var(--color-cyan);
  background: var(--color-active-faint);
  cursor: pointer;
}

.assistant-window__microphone--recording {
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.assistant-window__microphone:hover:not(:disabled) { background: var(--color-active-faint); }
.assistant-window__microphone:disabled { opacity: 0.5; cursor: not-allowed; }

.assistant-window__text-input {
  min-width: 0;
  flex: 1;
  height: 2.8rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
  background: var(--color-bg);
  font: inherit;
}

.assistant-window__text-input::placeholder {
  color: var(--color-text-tertiary);
}

.assistant-window__text-input:focus {
  outline: 1px solid var(--color-cyan);
  outline-offset: 1px;
}

.assistant-window__text-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.assistant-window__send {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 2.8rem;
  border: 1px solid var(--color-cyan);
  color: var(--color-cyan);
  background: var(--color-active-faint);
  cursor: pointer;
}

.assistant-window__send:hover:not(:disabled) {
  color: var(--color-bg);
  background: var(--color-cyan);
}

.assistant-window__send:disabled {
  border-color: var(--color-border);
  color: var(--color-text-tertiary);
  background: var(--color-surface);
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .assistant-window__loading {
    animation: none;
  }
}

@media (max-width: 700px) {
  .assistant-float {
    right: var(--space-3);
    bottom: var(--space-3);
  }
}
</style>
