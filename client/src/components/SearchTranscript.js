import React from 'react';

const SearchTranscript = ({ searchQuery, onQueryChange, onSearch, loading, searchButtonRef }) => {
  return (
    <div className="card my-4 p-3">
      <h3>Search in Transcript</h3>
      <p>Enter a query to find relevant parts:</p>
      <div className="input-group mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="e.g. 'social media impact'"
          value={searchQuery}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <button
          className="btn btn-primary"
          ref={searchButtonRef}
          onClick={onSearch}
          disabled={!searchQuery || loading}
        >
          Search
        </button>
      </div>
    </div>
  );
};

export default SearchTranscript;