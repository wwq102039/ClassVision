<template>
  <div class="login-wrap">
    <div class="brand">
      <div class="logo">智</div>
      <h1>智课眼</h1>
      <p>无感课堂考勤 · 学生端</p>
    </div>

    <div class="card">
      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field
            v-model="username"
            name="username"
            label="学号"
            placeholder="请输入学号"
            left-icon="contact-o"
            :rules="[{ required: true, message: '请输入学号' }]"
          />
          <van-field
            v-model="password"
            type="password"
            name="password"
            label="密码"
            placeholder="请输入密码"
            left-icon="lock"
            :rules="[{ required: true, message: '请输入密码' }]"
          />
        </van-cell-group>
        <div class="submit">
          <van-button round block type="primary" native-type="submit" :loading="loading">
            进入课堂
          </van-button>
        </div>
        <p class="hint">默认密码 123456</p>
      </van-form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { login } from '../api/auth'
import { getErrMsg } from '../api/client'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    const data = await login(username.value, password.value)
    localStorage.setItem('cv_token', data.token)
    localStorage.setItem('cv_name', data.name)
    showToast({ type: 'success', message: `欢迎，${data.name}` })
    router.replace('/')
  } catch (err) {
    showToast({ type: 'fail', message: getErrMsg(err) })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}
.brand {
  text-align: center;
  margin-bottom: 32px;
}
.logo {
  width: 68px;
  height: 68px;
  margin: 0 auto 14px;
  border-radius: 20px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 34px;
  font-weight: 800;
  line-height: 68px;
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.35);
}
.brand h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: 2px;
  color: #1f2937;
}
.brand p {
  margin: 6px 0 0;
  color: #8a94a6;
  font-size: 13px;
}
.card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 20px;
  padding: 20px 0 8px;
  box-shadow: 0 12px 32px rgba(60, 80, 140, 0.12);
}
.card :deep(.van-cell-group--inset) {
  margin: 0 16px;
}
.submit {
  margin: 20px 24px 0;
}
.submit .van-button {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  font-weight: 600;
}
.hint {
  text-align: center;
  color: #a0a8b8;
  font-size: 12px;
  margin-top: 14px;
}
</style>
