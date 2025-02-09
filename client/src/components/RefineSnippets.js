import React from 'react';

const RefineSnippets = ({ snippets, onRefine, onSkip, loading, refineButtonRef }) => {
  return (
    <div className="card my-4 p-3">
      <h3>Refine Snippets</h3>
      <p>Review the snippets below. You can refine/reorder them or skip this step.</p>
      <ul>
        {snippets.map((snippet, index) => (
          <li key={index}>{snippet.text}</li>
        ))}
      </ul>
      <div className='center_button'>
      <div className="d-flex gap-3 mt-3">
        <button
          className="btn btn-primary"
          ref={refineButtonRef}
          onClick={onRefine}
          disabled={loading}
        >
          Refine / Reorder
        </button>
        <button className="btn btn-light" onClick={onSkip} disabled={loading}>
          Skip
        </button>
      </div>
      </div>
    </div>
  );
};

export default RefineSnippets;