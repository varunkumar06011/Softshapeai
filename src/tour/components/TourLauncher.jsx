import React, { useState, useCallback } from 'react';
import { useTour } from '../core/TourContext.jsx';
import { getTour } from '../core/TourRegistry.js';
import { isTourCompleted, isTourDismissed } from '../core/TourState.js';

export default function TourLauncher({ tourId, label = 'Take a Tour', icon = '🎯', variant = 'button', className = '' }) {
  const { startTour, isTourActive, userId, restaurantId } = useTour();
  const [starting, setStarting] = useState(false);

  const handleClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTourActive || starting) return;
    setStarting(true);
    await startTour(tourId, { silent: true });
    setStarting(false);
  }, [tourId, startTour, isTourActive, starting]);

  const tour = getTour(tourId);
  if (!tour) return null;

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        className={`tour-launcher-icon ${className}`}
        title={label}
        aria-label={label}
        disabled={isTourActive || starting}
      >
        <span>{icon}</span>
      </button>
    );
  }

  if (variant === 'link') {
    return (
      <button
        onClick={handleClick}
        className={`tour-launcher-link ${className}`}
        disabled={isTourActive || starting}
      >
        <span>{icon}</span> {label}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`tour-launcher-button ${className}`}
      disabled={isTourActive || starting}
    >
      <span>{icon}</span> {starting ? 'Starting…' : label}
    </button>
  );
}
