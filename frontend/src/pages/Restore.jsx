import { useState, useRef } from "react";
import { restoreBackup } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";

export default function Restore() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  function handleFileChange(e) {
    setError(null);
    setResult(null);
    setPreview(null);

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.categories || !data.terms) {
          setError("Invalid backup file: missing 'categories' or 'terms' keys.");
          return;
        }
        setPreview(data);
      } catch {
        setError("Could not parse file as JSON.");
      }
    };
    reader.readAsText(file);
  }

  async function handleRestore() {
    if (!preview) return;

    const confirmed = window.confirm(
      "This will replace ALL existing data with the backup contents. This action cannot be undone. Continue?"
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await restoreBackup(preview);
      setResult(res);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Restore</h1>
      </div>

      <p>
        Upload a backup JSON file to replace all current data. This will delete
        all existing categories, terms, and definitions before importing the
        backup.
      </p>

      {error && <ErrorMessage message={error} />}

      <div className="form-group">
        <label htmlFor="backup-file">Backup file (.json)</label>
        <input
          ref={fileRef}
          id="backup-file"
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="input"
        />
      </div>

      {preview && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <strong>Preview</strong>
          </div>
          <div className="card-body">
            <p>
              Categories: <strong>{preview.categories.length}</strong>
            </p>
            <p>
              Terms: <strong>{preview.terms.length}</strong>
            </p>
            <p>
              Definitions:{" "}
              <strong>
                {preview.terms.reduce(
                  (sum, t) => sum + (t.definitions ? t.definitions.length : 0),
                  0
                )}
              </strong>
            </p>
          </div>
        </div>
      )}

      <div className="form-actions">
        <button
          className="btn btn-danger"
          onClick={handleRestore}
          disabled={loading || !preview}
        >
          {loading ? "Restoring..." : "Restore Backup"}
        </button>
      </div>

      {result && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-body">
            <p>
              <strong>Restore complete</strong> &mdash; {result.categories}{" "}
              categories, {result.terms} terms imported.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
