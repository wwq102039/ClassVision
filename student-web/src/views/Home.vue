<template>
  <div class="home">
    <!-- 渐变头部：个人信息 + 出勤率环形 -->
    <div class="hero">
      <div class="hero-main">
        <div class="avatar">{{ avatarChar }}</div>
        <div class="hero-info">
          <div class="hero-name">{{ student.name || '同学' }}</div>
          <div class="hero-meta">
            {{ student.student_no || '' }}<template v-if="student.class_name"> · {{ student.class_name }}</template>
          </div>
        </div>
      </div>
      <div class="hero-right">
        <van-circle
          :rate="ratePercent"
          :speed="60"
          :text="rateText"
          :size="92"
          :stroke-width="8"
          color="#ffffff"
          layer-color="rgba(255,255,255,0.28)"
        />
        <div class="rate-label">出勤率</div>
      </div>
    </div>

    <!-- 统计三卡片 -->
    <div class="stats">
      <div class="stat">
        <div class="stat-num green">{{ displayStats['正常'] ?? 0 }}</div>
        <div class="stat-label">正常</div>
      </div>
      <div class="stat">
        <div class="stat-num orange">{{ displayStats['迟到'] ?? 0 }}</div>
        <div class="stat-label">迟到</div>
      </div>
      <div class="stat">
        <div class="stat-num red">{{ displayStats['缺勤'] ?? 0 }}</div>
        <div class="stat-label">缺勤</div>
      </div>
    </div>

    <!-- 自助签到 -->
    <div class="block">
      <div class="block-title">自助签到</div>
      <div class="panel">
        <div class="picker-label">选择要签到的课堂</div>
        <div class="session-tags" v-if="checkinList.length">
          <div
            v-for="s in checkinList"
            :key="s.session_id"
            class="session-tag"
            :class="{ active: s.session_id === selectedSession && !s.checked, done: s.checked }"
            @click="!s.checked && (selectedSession = s.session_id)"
          >
            <div class="tag-name">{{ s.course_name }}</div>
            <div class="tag-date">{{ s.session_date }}</div>
            <van-tag v-if="s.checked" type="success" class="tag-status">已签到</van-tag>
          </div>
        </div>
        <div v-else class="empty-tip">暂无可签到的课堂</div>

        <div class="camera-box">
          <video v-show="cameraOn" ref="videoRef" autoplay playsinline muted class="camera-video" />
          <img v-if="previewUrl && !cameraOn" :src="previewUrl" class="camera-video" alt="预览" />
          <div v-if="!cameraOn && !previewUrl" class="camera-placeholder">
            <van-icon name="photograph" size="32" />
            <div>打开摄像头或上传本人照片</div>
          </div>
        </div>

        <div class="checkin-actions">
          <van-button v-if="!cameraOn" size="small" icon="video-o" @click="startCamera">打开摄像头</van-button>
          <van-button v-else size="small" icon="video-o" @click="stopCamera">关闭摄像头</van-button>
          <van-button
            size="small"
            type="primary"
            icon="checked"
            :loading="busy"
            :disabled="!selectedSession"
            @click="captureAndCheckin"
          >
            拍照签到
          </van-button>
          <van-uploader :after-read="onUpload" accept="image/*" :max-count="1">
            <van-button size="small" plain type="primary" icon="photo-o">上传照片</van-button>
          </van-uploader>
        </div>
      </div>
    </div>

    <!-- 按课程出勤率 -->
    <div class="block">
      <div class="block-title">按课程出勤率</div>
      <div class="panel">
        <div class="course-row" v-for="c in byCourse" :key="c.course_name">
          <div class="course-head">
            <span class="course-name">{{ c.course_name }}</span>
            <span class="course-rate">{{ c.rate != null ? Math.round(c.rate * 100) + '%' : '--' }}</span>
          </div>
          <van-progress
            :percentage="c.rate != null ? Math.round(c.rate * 100) : 0"
            :stroke-width="8"
            :show-pivot="false"
            color="linear-gradient(90deg, #6366f1, #8b5cf6)"
            track-color="#eef0f7"
          />
          <div class="course-tags">
            <van-tag type="success" plain>正常 {{ c['正常'] ?? 0 }}</van-tag>
            <van-tag type="warning" plain>迟到 {{ c['迟到'] ?? 0 }}</van-tag>
            <van-tag type="danger" plain>缺勤 {{ c['缺勤'] ?? 0 }}</van-tag>
          </div>
        </div>
        <van-empty v-if="!byCourse.length" description="暂无课程数据" image-size="72" />
      </div>
    </div>

    <!-- 我的申诉 -->
    <div class="block">
      <div class="block-title">我的申诉</div>
      <div class="panel">
        <div class="appeal-row" v-for="a in appeals" :key="a.id">
          <div class="appeal-top">
            <span class="appeal-course">{{ a.course_name }}</span>
            <van-tag :type="appealType(a.status)">{{ appealText(a.status) }}</van-tag>
          </div>
          <div class="appeal-meta">
            {{ a.session_date || '' }} · 提交于 {{ a.created_at || '' }}
          </div>
          <div class="appeal-reason" v-if="a.reason">申请理由：{{ a.reason }}</div>
          <div class="appeal-comment" v-if="a.comment">教师意见：{{ a.comment }}</div>
        </div>
        <van-empty v-if="!appeals.length" description="暂无申诉记录" image-size="72" />
      </div>
    </div>

    <!-- 考勤记录时间线 -->
    <div class="block">
      <div class="block-title">考勤记录</div>
      <div class="panel timeline-panel">
        <div class="timeline" v-if="records.length">
          <div class="tl-item" v-for="r in records" :key="r.id">
            <div class="tl-dot" :class="r.status === '正常' ? 'green' : 'orange'"></div>
            <div class="tl-body">
              <div class="tl-top">
                <span class="tl-course">{{ r.course_name }}</span>
                <van-tag :type="r.status === '正常' ? 'success' : 'warning'">{{ r.status }}</van-tag>
              </div>
              <div class="tl-time">{{ r.date || '' }} {{ r.sign_time || '' }}</div>
              <img v-if="r.photo_path" :src="`/static/${r.photo_path}`" class="tl-snap" alt="打卡" />
            </div>
          </div>
        </div>
        <van-empty v-else description="暂无考勤记录" image-size="72" />
      </div>
    </div>

    <!-- 缺勤记录（可申诉） -->
    <div class="block" v-if="absentSessions.length">
      <div class="block-title">缺勤记录（可申诉）</div>
      <div class="panel">
        <div class="absent-row" v-for="s in absentSessions" :key="s.session_id">
          <div class="absent-info">
            <div class="absent-course">{{ s.course_name || '未知课程' }}</div>
            <div class="absent-date">{{ s.session_date || '' }}</div>
          </div>
          <van-button size="small" type="warning" plain @click="onAppeal(s)">申诉</van-button>
        </div>
      </div>
    </div>

    <div class="logout-bar">
      <van-button plain block size="small" icon="revoke" @click="logout">退出登录</van-button>
    </div>

    <van-popup
      :show="!!successInfo"
      round
      class="success-pop"
      @click-overlay="successInfo = null"
    >
      <div class="success-body">
        <div class="check-wrap"><div class="check-icon"></div></div>
        <div class="success-title">签到成功</div>
        <div class="success-detail" v-if="successInfo">
          {{ successInfo.course }} · {{ successInfo.status }}
          <template v-if="successInfo.time"> · {{ successInfo.time }}</template>
        </div>
        <van-button round block type="primary" @click="successInfo = null">好的</van-button>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { myAttendance, myAppeals, createAppeal, checkinSessions, selfCheckin } from '../api/attendance'
import { getErrMsg } from '../api/client'
import { showToast, showConfirmDialog } from 'vant'

const router = useRouter()
const name = ref(localStorage.getItem('cv_name') || '同学')

const student = ref({})
const summary = ref({})
const attendanceRate = ref(null)
const byCourse = ref([])
const records = ref([])
const absentSessions = ref([])
const appeals = ref([])

// 自助签到
const checkinList = ref([])
const selectedSession = ref(null)
const cameraOn = ref(false)
const busy = ref(false)
const videoRef = ref(null)
const streamRef = ref(null)
const pendingFile = ref(null)
const previewUrl = ref('')
const successInfo = ref(null)

const displayRate = ref(0)
const displayStats = ref({ '正常': 0, '迟到': 0, '缺勤': 0 })

const avatarChar = computed(() => (student.value.name || name.value || '同').slice(0, 1))
const ratePercent = computed(() => Math.round((attendanceRate.value ?? 0) * 100))
const rateText = computed(() => (attendanceRate.value != null ? displayRate.value + '%' : '--'))

function animateNum(target, setter, duration = 900) {
  const from = 0
  const start = performance.now()
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - p, 3)
    setter(Math.round(from + (target - from) * eased))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

const availableSessions = computed(() => checkinList.value.filter((s) => !s.checked))

function appealText(status) {
  return { pending: '待审核', approved: '已通过', rejected: '已驳回' }[status] || status
}
function appealType(status) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[status] || 'default'
}

async function load() {
  try {
    const data = await myAttendance()
    student.value = data.student || {}
    summary.value = data.summary || {}
    attendanceRate.value = data.attendance_rate
    byCourse.value = data.by_course || []
    records.value = data.records || []
    absentSessions.value = data.absent_sessions || []
    animateNum(ratePercent.value, (v) => (displayRate.value = v))
    animateNum(summary.value['正常'] ?? 0, (v) => (displayStats.value['正常'] = v))
    animateNum(summary.value['迟到'] ?? 0, (v) => (displayStats.value['迟到'] = v))
    animateNum(summary.value['缺勤'] ?? 0, (v) => (displayStats.value['缺勤'] = v))
  } catch (err) {
    showToast({ type: 'fail', message: getErrMsg(err) })
  }
  loadAppeals()
}

async function loadAppeals() {
  try {
    appeals.value = await myAppeals()
  } catch {
    appeals.value = [] // 接口不可用时静默，不影响主看板
  }
}

async function loadCheckin() {
  try {
    const list = await checkinSessions()
    checkinList.value = list || []
    const avail = availableSessions.value
    if (!selectedSession.value || !avail.some((s) => s.session_id === selectedSession.value)) {
      selectedSession.value = avail.length ? avail[0].session_id : null
    }
  } catch {
    // 自助签到不可用时静默忽略
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
    })
    streamRef.value = stream
    videoRef.value.srcObject = stream
    await videoRef.value.play().catch(() => {})
    cameraOn.value = true
  } catch {
    showToast({ type: 'fail', message: '无法访问摄像头，可改用上传照片' })
  }
}

function stopCamera() {
  streamRef.value?.getTracks().forEach((t) => t.stop())
  streamRef.value = null
  cameraOn.value = false
}

function captureFrame() {
  return new Promise((resolve) => {
    const video = videoRef.value
    if (!video || !video.videoWidth) {
      resolve(null)
      return
    }
    const maxW = 640
    const scale = Math.min(1, maxW / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }))
      else resolve(null)
    }, 'image/jpeg', 0.85)
  })
}

function setPreview(file) {
  pendingFile.value = file
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
}

function onUpload(file) {
  if (file && file.file) setPreview(file.file)
}

async function captureAndCheckin() {
  let file = pendingFile.value
  if (cameraOn.value) {
    const frame = await captureFrame()
    if (frame) {
      file = frame
      setPreview(frame)
    }
  }
  if (!file) {
    showToast({ type: 'fail', message: '请先拍照或上传本人照片' })
    return
  }
  if (!selectedSession.value) {
    showToast({ type: 'fail', message: '请选择要签到的课堂' })
    return
  }
  busy.value = true
  try {
    const data = await selfCheckin(selectedSession.value, file)
    successInfo.value = {
      course: data.course_name,
      status: data.status,
      time: data.sign_time || '',
    }
    pendingFile.value = null
    previewUrl.value = ''
    await load()
    await loadCheckin()
  } catch (err) {
    showToast({ type: 'fail', message: getErrMsg(err) })
  } finally {
    busy.value = false
  }
}

async function onAppeal(s) {
  try {
    await showConfirmDialog({
      title: '发起申诉',
      message: `确认对「${s.course_name}」的缺勤记录发起申诉？`,
    })
  } catch {
    return
  }
  try {
    await createAppeal(s.session_id, '误判申诉：当天我在现场')
    showToast({ type: 'success', message: '申诉已提交，等待教师审核' })
    await load()
  } catch (err) {
    showToast({ type: 'fail', message: getErrMsg(err) })
  }
}

function logout() {
  localStorage.removeItem('cv_token')
  localStorage.removeItem('cv_name')
  router.replace('/login')
}

onMounted(() => {
  load()
  loadCheckin()
})

onBeforeUnmount(() => {
  streamRef.value?.getTracks().forEach((t) => t.stop())
})
</script>

<style scoped>
.home {
  max-width: 520px;
  margin: 0 auto;
  min-height: 100%;
  padding-bottom: 32px;
}

/* 渐变头部 */
.hero {
  margin: 0 0 16px;
  padding: 26px 24px 22px;
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.22), transparent 46%),
    linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%);
  border-radius: 0 0 26px 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.28);
  animation: fadeInUp 0.5s ease both;
}
.hero-main {
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  line-height: 56px;
  text-align: center;
  flex-shrink: 0;
}
.hero-name {
  font-size: 20px;
  font-weight: 700;
}
.hero-meta {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  margin-top: 4px;
}
.hero-right {
  text-align: center;
}
.hero-right :deep(.van-circle__text) {
  color: #fff;
  font-weight: 700;
  font-size: 18px;
}
.rate-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 4px;
}

/* 统计卡片 */
.stats {
  display: flex;
  gap: 12px;
  padding: 0 16px 16px;
  animation: fadeInUp 0.5s ease both;
}
.stat {
  flex: 1;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 16px;
  padding: 16px 0;
  text-align: center;
  box-shadow: 0 8px 28px rgba(60, 80, 140, 0.10);
}
.stat-num {
  font-size: 26px;
  font-weight: 800;
}
.stat-label {
  font-size: 13px;
  color: #8a94a6;
  margin-top: 4px;
}
.stat-num.green { color: #10b981; }
.stat-num.orange { color: #f59e0b; }
.stat-num.red { color: #ef4444; }

/* 区块 */
.block {
  padding: 0 16px 16px;
  animation: fadeInUp 0.5s ease both;
}
.block-title {
  font-size: 15px;
  font-weight: 700;
  color: #374151;
  padding: 4px 4px 10px;
}
.panel {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 28px rgba(60, 80, 140, 0.10);
}

/* 签到 */
.picker-label {
  font-size: 13px;
  color: #8a94a6;
  margin-bottom: 10px;
}
.session-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.session-tag {
  position: relative;
  min-width: 108px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.15s;
}
.session-tag.active {
  border-color: #6366f1;
  background: #eef0ff;
}
.session-tag.done {
  opacity: 0.6;
  cursor: default;
}
.tag-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.tag-date {
  font-size: 12px;
  color: #8a94a6;
  margin-top: 2px;
}
.tag-status {
  position: absolute;
  top: -8px;
  right: -8px;
}
.empty-tip {
  color: #a0a8b8;
  font-size: 13px;
  margin-bottom: 12px;
}
.camera-box {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin: 0 auto 12px;
  height: 240px;
  background: #0b1020;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.camera-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.camera-placeholder {
  color: #a0a8b8;
  font-size: 13px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.checkin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.checkin-actions .van-button--primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
}

/* 按课程出勤率 */
.course-row {
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f8;
}
.course-row:last-child {
  border-bottom: none;
}
.course-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.course-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.course-rate {
  font-size: 14px;
  font-weight: 700;
  color: #6366f1;
}
.course-tags {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* 我的申诉 */
.appeal-row {
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f8;
}
.appeal-row:last-child {
  border-bottom: none;
}
.appeal-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.appeal-course {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.appeal-meta {
  font-size: 12px;
  color: #8a94a6;
  margin-top: 4px;
}
.appeal-reason,
.appeal-comment {
  font-size: 13px;
  color: #6b7280;
  margin-top: 6px;
  line-height: 1.5;
}
.appeal-comment {
  color: #6366f1;
}

/* 考勤记录时间线 */
.timeline {
  padding: 4px 0;
}
.tl-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  position: relative;
}
.tl-item::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 24px;
  bottom: -8px;
  width: 2px;
  background: #e8ebf4;
}
.tl-item:last-child::before {
  display: none;
}
.tl-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
  z-index: 1;
}
.tl-dot.green { background: #10b981; }
.tl-dot.orange { background: #f59e0b; }
.tl-body {
  flex: 1;
  min-width: 0;
}
.tl-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tl-course {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.tl-time {
  font-size: 12px;
  color: #8a94a6;
  margin-top: 3px;
}
.tl-snap {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 10px;
  margin-top: 8px;
}

/* 缺勤记录 */
.absent-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f8;
}
.absent-row:last-child {
  border-bottom: none;
}
.absent-course {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.absent-date {
  font-size: 12px;
  color: #8a94a6;
  margin-top: 3px;
}

.logout-bar {
  padding: 4px 16px 0;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 签到成功弹窗 */
.success-pop {
  width: 78%;
  max-width: 320px;
  border-radius: 20px;
}
.success-body {
  padding: 28px 24px 22px;
  text-align: center;
}
.check-wrap {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #34d399);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: popIn 0.45s cubic-bezier(0.68, -0.55, 0.27, 1.55) both;
}
.check-icon {
  width: 22px;
  height: 12px;
  border-left: 3px solid #fff;
  border-bottom: 3px solid #fff;
  transform: rotate(-45deg);
  margin-top: -6px;
}
.success-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 6px;
}
.success-detail {
  font-size: 13px;
  color: #8a94a6;
  margin-bottom: 20px;
  line-height: 1.5;
}
.success-pop .van-button--primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
}
@keyframes popIn {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* 桌面宽屏：头部收成圆角卡片，与下方面板对齐，避免贴顶太生硬 */
@media (min-width: 768px) {
  .home {
    padding-top: 20px;
  }
  .hero {
    margin: 0 16px 16px;
    border-radius: 26px;
  }
}
</style>
