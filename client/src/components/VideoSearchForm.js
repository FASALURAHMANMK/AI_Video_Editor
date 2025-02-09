import React, { useState } from 'react';

// A simple helper to extract the YouTube video ID.
// (You may want to improve this regex to handle more URL formats.)
function extractVideoId(url) {
  const regex = /(?:\?v=|\/embed\/|\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function VideoSearchForm({ onFetchChunks, loading }) {
  // Holds the text in the input field
  const [urlInput, setUrlInput] = useState('');
  // Holds an array of added videos
  const [videos, setVideos] = useState([]);

  // Called when the user clicks the "Add Video" button.
  const handleAddVideo = (e) => {
    e.preventDefault();
    if (!urlInput) return;

    // Enforce a maximum of 5 videos.
    if (videos.length >= 5) return;

    // Extract the video ID. If invalid, alert the user.
    const videoId = extractVideoId(urlInput);
    if (!videoId) {
      alert('Invalid YouTube URL');
      return;
    }
    // Compute the thumbnail URL.
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    // Add the new video to the list.
    const newVideo = { url: urlInput, videoId, thumbnailUrl };
    setVideos([...videos, newVideo]);
    setUrlInput('');
  };

  // Remove a video from the list (by its index)
  const handleRemoveVideo = (index) => {
    const newVideos = [...videos];
    newVideos.splice(index, 1);
    setVideos(newVideos);
  };

  // Called when the user clicks the "Fetch Transcript" button.
  // Here we assume the onFetchChunks function can handle an array of URLs.
  const handleFetchAll = (e) => {
    e.preventDefault();
    if (videos.length === 0) return;
    const urls = videos.map((video) => video.url);
    onFetchChunks(urls);  // <-- Updated to call the prop function
  };

  return (
    <div className="card p-3">
      <h3>Paste a YouTube Link</h3>
      <br/>
      <form onSubmit={handleAddVideo}>
        <div className="input-group">
          <input
            className="form-control"
            type="text"
            value={urlInput}
            placeholder="e.g. https://www.youtube.com/watch?v=..."
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            type="submit"
            disabled={loading || !urlInput || videos.length >= 5}
          >
            Add Video
          </button>
        </div>
      </form>

      {/* Display the video thumbnails if there are any videos added */}
      {videos.length > 0 && (
        <div className="d-flex flex-wrap mt-3">
          {videos.map((video, index) => (
            <div
              key={index}
              className="position-relative m-2"
              style={{ width: '160px' }}
            >
              <img
                src={video.thumbnailUrl}
                alt="Video Thumbnail"
                className="img-thumbnail"
                style={{ width: '100%' }}
              />
              <button
                type="button"
                className="btn-close position-absolute"
                style={{ top: '5px', right: '5px'}}
                aria-label="Remove"
                onClick={() => handleRemoveVideo(index)}
              ></button>
            </div>
          ))}
        </div>
      )}

      {/* The Fetch Transcript button is now rendered below the thumbnails */}
      <br/>
      <div className='center_button'>
      <button
        className="btn btn-primary mt-3"
        type="button"
        onClick={handleFetchAll}
        disabled={loading || videos.length === 0}
      >
        Fetch Transcript{videos.length > 1 ? 's' : ''}
      </button>
      </div>
    </div>
  );
}

export default VideoSearchForm;