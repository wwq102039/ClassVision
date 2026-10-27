import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Home from '../views/Home.vue'

const routes = [
  { path: '/login', component: Login },
  { path: '/', component: Home },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = localStorage.getItem('cv_token')
  if (to.path !== '/login' && !token) {
    return '/login'
  }
  return true
})

export default router
