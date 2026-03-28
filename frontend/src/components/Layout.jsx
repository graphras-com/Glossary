import { NavLink, Outlet } from "react-router-dom";
import { useMsal } from "@azure/msal-react";

export default function Layout() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const handleLogout = () => {
    instance.logoutPopup({
      postLogoutRedirectUri: window.location.origin,
      mainWindowRedirectUri: window.location.origin,
    });
  };

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
          {account && (
            <span className="navbar-user">
              <span className="navbar-user-name">{account.name || account.username}</span>
              <button className="btn btn-sm btn-logout" onClick={handleLogout}>
                Sign out
              </button>
            </span>
          )}
        </div>
      </nav>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
