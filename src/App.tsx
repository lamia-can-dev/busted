import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import CreateGroup from './pages/CreateGroup'
import Onboarding from './pages/Onboarding'
import Game from './pages/Game'
import Activity from './pages/Activity'
import Proposals from './pages/Proposals'
import Leaderboard from './pages/Leaderboard'
import Profile from './pages/Profile'
import Login from './pages/Login'
import NavBar from './components/NavBar'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/groups" element={<CreateGroup />} />
          <Route path="/join/:invite_code" element={<Onboarding />} />
          <Route path="/game" element={<ProtectedRoute><Game /><NavBar /></ProtectedRoute>} />
          <Route path="/activity" element={<ProtectedRoute><Activity /><NavBar /></ProtectedRoute>} />
          <Route path="/proposals" element={<ProtectedRoute><Proposals /><NavBar /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /><NavBar /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /><NavBar /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
