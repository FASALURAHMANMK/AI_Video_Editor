// App.js (Updated with Professional UI)
import React, { useState } from 'react';
import VideoSearchForm from './components/VideoSearchForm';
import SnippetEditor from './components/SnippetEditor';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify'; // Adding Toasts for Feedback
import 'react-toastify/dist/ReactToastify.css'; // Toast Styling
import './App.css'; // Custom global styles

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [chunks, setChunks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [snippets, setSnippets] = useState([]);
  const [refinedOrder, setRefinedOrder] = useState([]);

  const [loading, setLoading] = useState(false);
  const [videoPath, setVideoPath] = useState(null);
  const [error, setError] = useState(null);

  const handleFetchChunks = async (url) => {
    try {
      setYoutubeUrl(url);
      setLoading(true);
      setError(null);
      setSnippets([]);
      setVideoPath(null);
      const response = await axios.post('http://localhost:5001/api/transcript-chunks', {
        youtubeUrl: url,
        maxChunkSize: 200,
      });
      if (response.data.error) {
        setError(response.data.error);
      } else {
        setChunks(response.data.chunks);
        toast.success('Transcript chunks fetched successfully!');
      }
    } catch (err) {
      toast.error('Failed to fetch transcript chunks.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query, topK = 5) => {
    if (!chunks.length) return;
    try {
      setSearchQuery(query);
      setLoading(true);
      setError(null);
      setVideoPath(null);

      const resp = await axios.post('http://localhost:5001/api/search-snippets', {
        chunks: chunks,
        query: query,
        topK: topK,
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        setSnippets(resp.data.results);
        setRefinedOrder([]);
        toast.success('Top snippets found!');
      }
    } catch (err) {
      toast.error('Snippet search failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefineOrder = async () => {
    if (!snippets.length) return;
    try {
      setLoading(true);
      setError(null);

      const resp = await axios.post('http://localhost:5001/api/refine-snippets', {
        snippets: snippets,
        query: searchQuery,
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        const newOrder = resp.data.order;
        const reordered = newOrder.map((idx) => snippets[idx]).filter(Boolean);
        setSnippets(reordered);
        toast.info('Snippets refined and reordered.');
      }
    } catch (err) {
      toast.error('Refining order failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVideo = async (finalSnippets) => {
    try {
      setLoading(true);
      setError(null);
      setVideoPath(null);
      const resp = await axios.post('http://localhost:5001/api/create-video', {
        youtubeUrl: youtubeUrl,
        snippets: finalSnippets,
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        setVideoPath(resp.data.videoPath);
        toast.success('Highlight video created!');
      }
    } catch (err) {
      toast.error('Video creation failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container my-4">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />
      <h1 className="text-center gradient-text">AI Video Editor</h1>

      <VideoSearchForm onFetchChunks={handleFetchChunks} loading={loading} />

      {error && <div className="alert alert-danger my-3">{error}</div>}
      {loading && <div className="loading-spinner">Loading...</div>}

      {chunks.length > 0 && (
        <div className="card my-4 p-3 animated-section">
          <h3>Step 2: Search in Transcript</h3>
          <p>Enter a query to find relevant parts:</p>
          <div className="input-group mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="e.g. 'social media impact'"
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
        <div className="card my-4 p-3 fade-in">
          <h3>Top Snippets</h3>
          <button
            className="btn btn-secondary mt-3"
            onClick={handleRefineOrder}
            disabled={loading}
          >
            Refine/Reorder Snippets
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
          <p>Download your video:</p>
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
