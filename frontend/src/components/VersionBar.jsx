/**
 * Sticky bottom bar displaying build/deployment metadata.
 *
 * Values are injected at build time via Vite's `define` config.
 * In local dev they fall back to "dev" / "local".
 */

/* global __BUILD_COMMIT__, __BUILD_TAG__, __BUILD_TIME__, __BUILD_BRANCH__ */

export default function VersionBar() {
  const commit = __BUILD_COMMIT__;
  const tag = __BUILD_TAG__;
  const branch = __BUILD_BRANCH__;
  const buildTime = __BUILD_TIME__;

  const shortCommit = commit.length > 7 ? commit.slice(0, 7) : commit;
  const formattedTime = buildTime !== "dev"
    ? new Date(buildTime).toLocaleString()
    : "dev";

  return (
    <footer className="version-bar">
      <span className="version-item">
        <span className="version-label">commit</span> {shortCommit}
      </span>
      {tag && (
        <span className="version-item">
          <span className="version-label">tag</span> {tag}
        </span>
      )}
      <span className="version-item">
        <span className="version-label">branch</span> {branch}
      </span>
      <span className="version-item">
        <span className="version-label">built</span> {formattedTime}
      </span>
    </footer>
  );
}
