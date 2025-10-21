import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import AppFooter from "./components/AppFooter";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Play from "./pages/Play";
import Leaderboard from "./pages/Leaderboard";
import "/src/styles.css";

export default function App() {
  return (
    <BrowserRouter>
      <AppHeader />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/play/:roomCode" element={<Play />} />
        <Route path="/leaderboard/:roomCode" element={<Leaderboard />} />
      </Routes>
      <AppFooter />
    </BrowserRouter>
  );
}
