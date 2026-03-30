import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { getSession } from './lib/session'
import CreateGroup from './pages/CreateGroup'
import Onboarding from './pages/Onboarding'
import Game from './pages/Game'
import Activity from './pages/Activity'
import Proposals from './pages/Proposals'
import Leaderboard from './pages/Leaderboard'
import Profile from './pages/Profile'
import NavBar from './components/NavBar'

export default function App() {
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    restoreSession()
  }, [])

  async function restoreSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      const stored = getSession()
      if (stored?.refreshToken) {
        await supabase.auth.refreshSession({ refresh_token: stored.refreshToken })
      }
    }
    setAuthReady(true)
  }

  if (!authReady) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreateGroup />} />
        <Route path="/join/:invite_code" element={<Onboarding />} />
        <Route path="/game" element={<><Game /><NavBar /></>} />
        <Route path="/activity" element={<><Activity /><NavBar /></>} />
        <Route path="/proposals" element={<><Proposals /><NavBar /></>} />
        <Route path="/leaderboard" element={<><Leaderboard /><NavBar /></>} />
        <Route path="/profile" element={<><Profile /><NavBar /></>} />
      </Routes>
    </BrowserRouter>
  )
}
