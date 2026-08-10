import React, { useEffect, useState } from 'react';
import { TourProvider, TourTooltip, TourCenter, registerTours } from './index.js';

import { useTour } from './core/TourContext.jsx';

import landingTour from './definitions/landingTour.js';
import onboardingTour from './definitions/onboardingTour.js';
import adminTours from './definitions/adminTours.js';
import cashierTours from './definitions/cashierTours.js';
import captainTours from './definitions/captainTours.js';
import cloudSyncTour from './definitions/cloudSyncTour.js';

let toursRegistered = false;

function registerAllTours() {
  if (toursRegistered) return;
  registerTours([landingTour, onboardingTour, cloudSyncTour]);
  registerTours(adminTours);
  registerTours(cashierTours);
  registerTours(captainTours);
  toursRegistered = true;
}

function TourHelpFab() {
  const { setTourCenterOpen, isTourActive } = useTour();

  if (isTourActive) return null;

  return (
    <button
      className="tour-help-fab"
      onClick={() => setTourCenterOpen(true)}
      aria-label="Tour Guide & Help"
      title="Tour Guide & Help"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>Guide</span>
    </button>
  );
}

export default function TourRoot({ children }) {
  useEffect(() => {
    registerAllTours();
  }, []);

  return (
    <TourProvider>
      {children}
      <TourTooltip />
      <TourCenter />
      <TourHelpFab />
    </TourProvider>
  );
}
