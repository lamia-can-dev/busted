import { BrowserRouter, Routes, Route } from 'react-router-dom'
import CreateGroup from './pages/CreateGroup'
import Onboarding from './pages/Onboarding'
import Game from './pages/Game'
import Feed from './pages/Feed'
import NavBar from './components/NavBar'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreateGroup />} />
        <Route path="/join/:invite_code" element={<Onboarding />} />
        <Route path="/game" element={<><Game /><NavBar /></>} />
        <Route path="/feed" element={<><Feed /><NavBar /></>} />
      </Routes>
    </BrowserRouter>
  )
}
