import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

import VideoSearchForm from './components/VideoSearchForm';
import SnippetEditor from './components/SnippetEditor';
import WelcomeCard from './components/WelcomeCard';
import TabsNavigation from './components/TabsNavigation';
import SearchTranscript from './components/SearchTranscript';
import RefineSnippets from './components/RefineSnippets';
import VideoPreview from './components/VideoPreview';

// A simple full-screen overlay spinner.
function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="spinner-border text-light" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}

function App() {
  // Welcome state
  const [showWelcome, setShowWelcome] = useState(true);

  // Application state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [chunks, setChunks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [snippets, setSnippets] = useState([]);
  const [videoPath, setVideoPath] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Step tracking:
  // 1 - Fetch Transcript, 2 - Search, 3 - Refine, 4 - Create, 5 - Preview
  const [currentStep, setCurrentStep] = useState(1);

  // Refs for auto-focusing buttons
  const searchButtonRef = useRef(null);
  const refineButtonRef = useRef(null);
  const createVideoButtonRef = useRef(null);
  const downloadButtonRef = useRef(null);

  // Auto-focus logic on step change (if not loading)
  useEffect(() => {
    if (!loading) {
      switch (currentStep) {
        case 2:
          searchButtonRef.current?.focus();
          break;
        case 3:
          refineButtonRef.current?.focus();
          break;
        case 4:
          createVideoButtonRef.current?.focus();
          break;
        case 5:
          downloadButtonRef.current?.focus();
          break;
        default:
          break;
      }
    }
  }, [currentStep, loading]);

  // Handlers
  const handleStart = () => {
    setShowWelcome(false);
    setCurrentStep(1);
  };

  const handleFetchChunks = async (videoUrls) => {
    try {
      // Reset state before starting
      setLoading(true);
      setError(null);
      setSnippets([]); // if needed
      setVideoPath(null); // if needed
  
      // Create an array of requests—one for each video URL.
      const requests = videoUrls.map((url) =>
        axios.post('http://localhost:5001/api/transcript-chunks', {
          youtubeUrl: url,
          maxChunkSize: 200,
        })
      );
  
      // Wait for all requests to complete concurrently.
      const responses = await Promise.all(requests);
  
      // Process and aggregate the chunks from each response.
      // Here we also tag each chunk with its video URL for future reference.
      let aggregatedChunks = [];
responses.forEach((response, index) => {
  if (response.data.error) {
    toast.error(`Error for video ${index + 1}: ${response.data.error}`);
  } else {
    const chunksWithVideoInfo = response.data.chunks.map((chunk) => ({
      ...chunk,
      videoUrl: videoUrls[index],
    }));
    aggregatedChunks = [...aggregatedChunks, ...chunksWithVideoInfo];
  }
});

// Save the aggregated chunks in state.
setChunks(aggregatedChunks);

// IMPORTANT: Set the primary YouTube URL for the create-video endpoint.
// Here we choose the first video URL from the list.
setYoutubeUrl(videoUrls[0]);

toast.success('Transcript chunks fetched successfully for all videos!');
setCurrentStep(2);
    } catch (err) {
      toast.error('Failed to fetch transcript chunks.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!chunks.length) return;
    try {
      setLoading(true);
      setError(null);
      setVideoPath(null);

      const resp = await axios.post('http://localhost:5001/api/search-snippets', {
        chunks,
        query: searchQuery,
        topK: 5,
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        setSnippets(resp.data.results);
        toast.success('Top snippets found!');
        setCurrentStep(3);
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
        snippets,
        query: searchQuery,
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        const newOrder = resp.data.order;
        const reordered = newOrder.map((idx) => snippets[idx]).filter(Boolean);
        setSnippets(reordered);
        toast.info('Snippets refined and reordered.');
        setCurrentStep(4);
      }
    } catch (err) {
      toast.error('Refining order failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipRefine = () => {
    setCurrentStep(4);
  };

  const handleCreateVideo = async (finalSnippets) => {
    try {
      setLoading(true);
      setError(null);
      setVideoPath(null);
      const resp = await axios.post('http://localhost:5001/api/create-video', {
        youtubeUrl,
        snippets: finalSnippets,
      });
      if (resp.data.error) {
        setError(resp.data.error);
      } else {
        setVideoPath(resp.data.videoPath);
        toast.success('Highlight video created!');
        setCurrentStep(5);
      }
    } catch (err) {
      toast.error('Video creation failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Helper: allow navigation only to steps already reached.
  const isStepAccessible = (step) => step <= currentStep;

  return (
    <div className="container py-4 position-relative">
      {loading && <LoadingOverlay />}
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />

      {showWelcome ? (
        <WelcomeCard onStart={handleStart} />
      ) : (
        <>
          <TabsNavigation
            currentStep={currentStep}
            onTabChange={setCurrentStep}
            isStepAccessible={isStepAccessible}
          />

          <div className="tab-content mt-4">
            {currentStep === 1 && (
              <div className="tab-pane active">
                <VideoSearchForm onFetchChunks={handleFetchChunks} loading={loading} />
              </div>
            )}

            {currentStep === 2 && (
              <div className="tab-pane active">
                <SearchTranscript
                  searchQuery={searchQuery}
                  onQueryChange={setSearchQuery}
                  onSearch={handleSearch}
                  loading={loading}
                  searchButtonRef={searchButtonRef}
                />
              </div>
            )}

            {currentStep === 3 && (
              <div className="tab-pane active">
                <RefineSnippets
                  snippets={snippets}
                  onRefine={handleRefineOrder}
                  onSkip={handleSkipRefine}
                  loading={loading}
                  refineButtonRef={refineButtonRef}
                />
              </div>
            )}

            {currentStep === 4 && (
              <div className="tab-pane active">
                <div className="card my-4 p-3">
                  <h3>Step 4: Create Video</h3>
                  <SnippetEditor
                    snippets={snippets}
                    onCreateVideo={handleCreateVideo}
                    loading={loading}
                    createVideoButtonRef={createVideoButtonRef}
                  />
                </div>
              </div>
            )}

            {currentStep === 5 && videoPath && (
              <div className="tab-pane active">
                <VideoPreview videoPath={videoPath} downloadButtonRef={downloadButtonRef} />
              </div>
            )}
          </div>

          {error && <div className="alert alert-danger my-3">{error}</div>}
        </>
      )}
    </div>
  );
}

export default App;