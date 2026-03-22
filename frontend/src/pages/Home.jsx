import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="home">
      <h1>Dictionary API</h1>
      <p>A glossary of telecom terms with bilingual definitions (English / Danish).</p>

      <div className="home-cards">
        <Link to="/terms" className="home-card">
          <h2>Terms</h2>
          <p>Browse, search, create, and manage glossary terms and their definitions.</p>
        </Link>
        <Link to="/categories" className="home-card">
          <h2>Categories</h2>
          <p>Manage the hierarchical category taxonomy used to classify definitions.</p>
        </Link>
      </div>
    </div>
  );
}
