import { NavLink } from "react-router-dom";
import "/src/styles.css";

export default function AppHeader() {
  return (
    <header className="header">
      <div className="header-inner container">
        <img className="header-logo" src="/logo-placeholder.svg" alt="Logo" />
        <div className="header-title">Bệnh viện An Phước</div>
        <nav className="nav">
          <NavLink to="/" end>Trang chủ</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
      </div>
    </header>
  );
}
