import React, { useState } from "react";
import { useUser } from "./contexts/UserContext";
import DataRecordView from "./components/DataRecord/DataRecordView";
import { logger } from "./utils/logger";
import "./App.css";

/**
 * Main App component
 */
const App: React.FC = () => {
  const { user, loading, error, logout } = useUser();
  const [recordId, setRecordId] = useState<string>("");
  const [showRecord, setShowRecord] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (recordId.trim()) {
      setShowRecord(true);
    }
  };

  const handleReset = () => {
    setRecordId("");
    setShowRecord(false);
  };

  if (loading) {
    return <div className="loading">Loading user data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!user) {
    return (
      <div className="login-required">
        <h2>Please log in to access DataFed</h2>
        <p>You need to be authenticated to use this application.</p>
        <a href="/ui/login" className="login-button">
          Log In
        </a>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>DataFed</h1>
        <div className="user-info">
          <span>
            Welcome, {user.nameFirst} {user.nameLast}
          </span>
          <button onClick={logout} className="logout-button">
            Log Out
          </button>
        </div>
      </header>

      <main className="app-content">
        <section className="search-section">
          <h2>Data Record Lookup</h2>
          <form onSubmit={handleSubmit} className="record-form">
            <div className="form-group">
              <label htmlFor="recordId">Record ID:</label>
              <input
                type="text"
                id="recordId"
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                placeholder="Enter record ID"
                required
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                View Record
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-secondary"
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        {showRecord && (
          <section className="record-section">
            <h2>Record Details</h2>
            <DataRecordView
              recordId={recordId}
              onEdit={(record) => logger.info("Edit record:", record)}
              onDelete={(id) => {
                logger.info("Delete record:", id);
                handleReset();
              }}
            />
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>
          &copy; {new Date().getFullYear()} DataFed - Oak Ridge National
          Laboratory
        </p>
      </footer>
    </div>
  );
};

export default App;
