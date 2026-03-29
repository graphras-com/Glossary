/**
 * Landing page — auto-generates cards for each resource.
 *
 * While this page is config-driven, it's typically customised per
 * application to show a more tailored welcome message.  This version
 * is a sensible default.
 */

import { Link } from "react-router-dom";
import { getNavResources, appConfig } from "../config/resources";

export default function Home() {
  const navResources = getNavResources();

  return (
    <div className="home">
      <h1>{appConfig.name}</h1>
      <p>{appConfig.description}</p>

      <div className="home-cards">
        {navResources.map((r) => (
          <Link key={r.name} to={`/${r.name}`} className="home-card">
            <h2>{r.label}</h2>
            <p>
              Browse, search, create, and manage{" "}
              {r.label.toLowerCase()}.
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
