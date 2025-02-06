import React, { useState } from 'react';

function SnippetEditor({ snippets, onCreateVideo, loading }) {
  const [localSnippets, setLocalSnippets] = useState(
    snippets.map(snip => ({
      ...snip,
      shiftStart: 0,
      shiftEnd: 0
    }))
  );

  // If the 'snippets' prop changes externally (refined order),
  // you may also want to re-sync localSnippets. For brevity, ignoring here.

  const handleShiftChange = (index, field, value) => {
    const updated = [...localSnippets];
    updated[index][field] = parseFloat(value) || 0;
    setLocalSnippets(updated);
  };

  const handleCreate = () => {
    // Pass these adjusted snippets to the backend
    onCreateVideo(localSnippets);
  };

  return (
    <div className="mt-3">
      <h4>Adjust Snippet Times</h4>
      <small>Shift start/end in seconds (+ or -)</small>
      <div>
        {localSnippets.map((snip, idx) => (
          <div key={idx} className="my-2 p-2 border rounded">
            <strong>Snippet #{idx + 1}</strong>
            <div>Original start: {snip.start.toFixed(2)}s, end: {snip.end.toFixed(2)}s</div>
            <div>Text: {snip.text}</div>
            <div className="d-flex align-items-center mt-2">
              <label className="me-2">Shift Start (s):</label>
              <input
                className="form-control me-2"
                style={{width: '100px'}}
                type="number"
                step="0.1"
                value={snip.shiftStart}
                onChange={(e) => handleShiftChange(idx, 'shiftStart', e.target.value)}
              />
              <label className="me-2">Shift End (s):</label>
              <input
                className="form-control me-2"
                style={{width: '100px'}}
                type="number"
                step="0.1"
                value={snip.shiftEnd}
                onChange={(e) => handleShiftChange(idx, 'shiftEnd', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn btn-primary mt-3"
        onClick={handleCreate}
        disabled={loading}
      >
        Create Highlight Video
      </button>
    </div>
  );
}

export default SnippetEditor;