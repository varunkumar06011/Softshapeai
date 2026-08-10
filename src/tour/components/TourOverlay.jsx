import React from 'react';

export default function TourOverlay({ targetRect }) {
  const padding = 8;
  const radius = 8;

  if (!targetRect) {
    return (
      <div
        className="tour-overlay"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9998,
        }}
        aria-hidden="true"
      />
    );
  }

  const top = Math.max(0, targetRect.top - padding);
  const left = Math.max(0, targetRect.left - padding);
  const width = targetRect.width + padding * 2;
  const height = targetRect.height + padding * 2;

  return (
    <>
      <div
        className="tour-overlay"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9998,
          clipPath: `polygon(0% 0%, 0% 100%, ${left}px 100%, ${left}px ${top}px, ${left + width}px ${top}px, ${left + width}px ${top + height}px, ${left}px ${top + height}px, ${left}px 100%, 100% 100%, 100% 0%)`,
        }}
        aria-hidden="true"
      />
      <div
        className="tour-highlight"
        style={{
          position: 'fixed',
          top,
          left,
          width,
          height,
          borderRadius: radius,
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 0 0 4px rgba(229, 57, 53, 0.5), 0 0 0 2px rgba(229, 57, 53, 1)',
        }}
        aria-hidden="true"
      />
    </>
  );
}
