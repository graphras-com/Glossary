/**
 * Application shell — navbar + content outlet.
 *
 * Navigation links are auto-generated from the resource config.
 * This file is **generic**.  When creating a new application, you
 * should not need to modify it.
 */

import { NavLink, Outlet } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { getNavResources, appConfig } from "../config/resources";
import VersionBar from "./VersionBar";

export default function Layout() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const navResources = getNavResources();

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
          <NavLink to="/">{appConfig.name}</NavLink>
        </div>
        <div className="navbar-links">
          {navResources.map((r) => (
            <NavLink
              key={r.name}
              to={`/${r.name}`}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {r.label}
            </NavLink>
          ))}
        </div>
        <div className="navbar-links navbar-right">
          {appConfig.hasBackup && (
            <>
              <NavLink
                to="/backup"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Backup
              </NavLink>
              <NavLink
                to="/restore"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Restore
              </NavLink>
            </>
          )}
          {account && (
            <span className="navbar-user">
              <span className="navbar-user-name">
                {account.name || account.username}
              </span>
              <button
                className="btn btn-sm btn-logout"
                onClick={handleLogout}
              >
                Sign out
              </button>
            </span>
          )}
        </div>
      </nav>
      <main className="container">
        <Outlet />
      </main>
      <VersionBar />
    </div>
  );
}
