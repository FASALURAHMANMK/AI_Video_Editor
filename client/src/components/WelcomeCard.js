import React, { useState } from 'react';// Import the CSS file

const WelcomeCard = ({ onStart }) => {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="welcome-card-container">
      <div className="welcome-card">
        <h2>Welcome to AI Video Editor</h2>
        <h4>Terms and Conditions</h4>
        <div class="container">
    <p>
        By using AI Video Editor, you agree to comply with all applicable laws and not use the service for illegal, harmful, or infringing content. 
        You retain ownership of your uploaded content, while we reserve the right to process it to provide our services. 
        We do not guarantee uninterrupted service and are not liable for any damages arising from its use. 
        Subscription fees are non-refundable unless stated otherwise. 
        We may modify or discontinue features at any time. 
        Continued use after updates to these terms implies acceptance. 
        For questions, contact us at <a href="mailto:fasalurahmanmkf@gmail.com">fasalurahmanmkf@gmail.com</a>.
    </p>
</div>
        <div className="form-check mb-3">
          <input
            type="checkbox"
            className="form-check-input"
            id="termsCheck"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="termsCheck">
            I agree to the Terms and Conditions.
          </label>
        </div>
        <button className="btn btn-primary" disabled={!accepted} onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  );
};

export default WelcomeCard;