import React, { useState } from 'react';

function VideoSearchForm({ onFetchChunks, loading }) {
  const [urlInput, setUrlInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!urlInput) return;
    onFetchChunks(urlInput);
  };

  return (
    <div className="card p-3">
      <h3>Step 1: Paste a YouTube Link</h3>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <input
            className="form-control"
            type="text"
            value={urlInput}
            placeholder="e.g. https://www.youtube.com/watch?v=..."
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !urlInput}
          >
            Fetch Transcript
          </button>
        </div>
      </form>
    </div>
  );
}

export default VideoSearchForm;