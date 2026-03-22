import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-brand">
          <NavLink to="/">Telecom Glossary</NavLink>
        </div>
        <div className="navbar-links">
          <NavLink to="/terms" className={({ isActive }) => (isActive ? "active" : "")}>
            Terms
          </NavLink>
          <NavLink to="/categories" className={({ isActive }) => (isActive ? "active" : "")}>
            Categories
          </NavLink>
        </div>
        <div className="navbar-links navbar-right">
          <NavLink to="/backup" className={({ isActive }) => (isActive ? "active" : "")}>
            Backup
          </NavLink>
          <NavLink to="/restore" className={({ isActive }) => (isActive ? "active" : "")}>
            Restore
          </NavLink>
        </div>
      </nav>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
