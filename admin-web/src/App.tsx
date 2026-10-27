import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import Courses from './pages/Courses'
import Sessions from './pages/Sessions'
import Monitor from './pages/Monitor'
import Attendance from './pages/Attendance'
import Faces from './pages/Faces'
import Reports from './pages/Reports'
import Appeals from './pages/Appeals'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('cv_token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="sessions/:id/monitor" element={<Monitor />} />
          <Route path="students" element={<Students />} />
          <Route path="courses" element={<Courses />} />
          <Route path="faces" element={<Faces />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="appeals" element={<Appeals />} />
          <Route path="reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
