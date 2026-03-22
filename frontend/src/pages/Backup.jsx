import { useState } from "react";
import { getBackup } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";

export default function Backup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    setStats(null);
    try {
      const data = await getBackup();
      setStats({ categories: data.categories.length, terms: data.terms.length });

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `glossary-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Backup</h1>
      </div>

      <p>
        Download a complete backup of all categories, terms, and definitions as
        a single JSON file.
      </p>

      {error && <ErrorMessage message={error} />}

      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleDownload}
          disabled={loading}
        >
          {loading ? "Preparing..." : "Download Backup"}
        </button>
      </div>

      {stats && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-body">
            <p>
              <strong>Backup downloaded</strong> &mdash; {stats.categories}{" "}
              categories, {stats.terms} terms.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
