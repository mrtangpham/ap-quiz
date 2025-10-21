import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Play from "./pages/Play";
import Leaderboard from "./pages/Leaderboard";
import ControlRoom from "./pages/ControlRoom";
import "/src/styles.css";

export default function App() {
  return (
    <BrowserRouter>
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <img src="/logo-placeholder.svg" alt="logo" style={{ height: 28 }} />
            <span>Bệnh viện An Phước</span>
          </div>
          <nav className="nav">
            <Link to="/">Trang chủ</Link>
            <Link to="/admin">Admin</Link>
          </nav>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/play/:roomCode" element={<Play />} />
          <Route path="/leaderboard/:roomCode" element={<Leaderboard />} />
          <Route path="/control/:roomCode" element={<ControlRoom />} />
        </Routes>
      </main>

      <footer className="footer">phát triển bởi <strong>TANGPHAM</strong></footer>
    </BrowserRouter>
  );
}
