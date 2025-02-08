import React from 'react';

const TabsNavigation = ({ currentStep, onTabChange, isStepAccessible }) => {
  const tabs = [
    { step: 1, label: 'Fetch Transcript' },
    { step: 2, label: 'Search Transcript' },
    { step: 3, label: 'Refine Snippets' },
    { step: 4, label: 'Create Video' },
    { step: 5, label: 'Video' },
  ];

  return (
    <ul className="nav nav-tabs">
      {tabs.map((tab) => (
        <li className="nav-item" key={tab.step}>
          <button
            className={`nav-link ${currentStep === tab.step ? 'active' : ''}`}
            onClick={() => isStepAccessible(tab.step) && onTabChange(tab.step)}
            disabled={!isStepAccessible(tab.step)}
          >
            {tab.step}. {tab.label}
          </button>
        </li>
      ))}
    </ul>
  );
};

export default TabsNavigation;