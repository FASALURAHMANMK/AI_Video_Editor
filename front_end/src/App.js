import React, { useState } from 'react';
import VideoSearchForm from './components/VideoSearchForm';
import SnippetList from './components/SnippetList';
import SnippetEditor from './components/SnippetEditor';
import axios from 'axios';

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [chunks, setChunks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [snippets, setSnippets] = useState([]);
  const [refinedOrder, setRefinedOrder] = useState([]);

  const [loading, setLoading] = useState(false);
  const [videoPath, setVideoPath] = useState(null);
  const [error, setError] = useState(null);

  // 1) Fetch transcript chunks
  const handleFetchChunks = async (url) => {
    try {
      setYoutubeUrl(url);
      setLoading(true);
      setError(null);
      setSnippets([]);
      setVideoPath(null);
      const response = await axios.post('http://localhost:5001/api/transcript-chunks', {
        youtubeUrl: url,
        maxChunkSize: 200
      });
      if (response.data.error) {
        setError(response.data.error);
      } else {
        setChunks(response.data.chunks);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2) Search for relevant snippets
  const handleSearch = async (query, topK=5) => {
    if (!chunks.length) return;
    try {
      setSearchQuery(query);
      setLoading(true);
      setError(null);
      setVideoPath(null);

      const resp = await axios.post('http://localhost:5001/api/search-snippets', {
        chunks: chunks,
        query: query,
        topK: topK
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        setSnippets(resp.data.results);
        setRefinedOrder([]);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3) Refine snippet order using LLM
  const handleRefineOrder = async () => {
    if (!snippets.length) return;
    try {
      setLoading(true);
      setError(null);

      const resp = await axios.post('http://localhost:5001/api/refine-snippets', {
        snippets: snippets,
        query: searchQuery
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        const newOrder = resp.data.order;
        // rearrange the existing snippets array
        const reordered = newOrder.map(idx => snippets[idx]).filter(Boolean);
        setSnippets(reordered);
        setRefinedOrder(newOrder);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 4) Create final highlight video
  const handleCreateVideo = async (finalSnippets) => {
    try {
      setLoading(true);
      setError(null);
      setVideoPath(null);
      const resp = await axios.post('http://localhost:5001/api/create-video', {
        youtubeUrl: youtubeUrl,
        snippets: finalSnippets
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        setVideoPath(resp.data.videoPath);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container my-4">
      <h1 className="mb-3">AI Video Editor</h1>

      <VideoSearchForm onFetchChunks={handleFetchChunks} loading={loading}/>
      
      {error && <div className="alert alert-danger my-3">{error}</div>}
      {loading && <div>Loading...</div>}

      {chunks.length > 0 && (
        <div className="card my-4 p-3">
          <h3>Step 2: Search in Transcript</h3>
          <p>Now that we've fetched transcript chunks, enter a query to find relevant parts:</p>
          <div className="input-group mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="e.g. 'why social media is harmful'"
              onChange={(e) => setSearchQuery(e.target.value)}
              value={searchQuery}
            />
            <button
              className="btn btn-primary"
              onClick={() => handleSearch(searchQuery, 5)}
              disabled={!searchQuery || loading}
            >
              Search
            </button>
          </div>
        </div>
      )}

      {snippets.length > 0 && (
        <div className="card my-4 p-3">
          <h3>Top Snippets</h3>
          <SnippetList snippets={snippets} />
          
          <button
            className="btn btn-secondary mt-3"
            onClick={handleRefineOrder}
            disabled={loading}
          >
            Refine/Reorder with LLM
          </button>

          <SnippetEditor
            snippets={snippets}
            onCreateVideo={handleCreateVideo}
            loading={loading}
          />
        </div>
      )}

      {videoPath && (
        <div className="card p-3 my-4">
          <h4>Video Created!</h4>
          <p>Download or watch your highlight video:</p>
          <a
            href={`http://localhost:5001/api/download-video/${videoPath.split('/').pop()}`}
            className="btn btn-success"
            target="_blank"
            rel="noreferrer"
          >
            Download/Play
          </a>
        </div>
      )}
    </div>
  );
}

export default App;