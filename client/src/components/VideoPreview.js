import React from 'react';

const VideoPreview = ({ videoPath, downloadButtonRef }) => {
  const videoUrl = `http://localhost:5001/api/download-video/${videoPath.split('/').pop()}`;
  return (
    <div className="card p-3 my-4">
      <h3>Video Preview</h3>
      <div className="text-center">
        <video
          className="video-player"
          controls
          style={{ width: '100%', maxWidth: '600px', borderRadius: '8px' }}
        >
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <div className="mt-3">
          <a
            href={videoUrl}
            className="btn btn-success"
            target="_blank"
            rel="noreferrer"
            style={{ width: 'auto' }}
            ref={downloadButtonRef}
          >
            Download Video
          </a>
        </div>
      </div>
    </div>
  );
};

export default VideoPreview;