import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTour } from '../core/TourContext.jsx';
import { computeTooltipPosition, isMobileViewport } from '../core/TourEngine.js';
import TourOverlay from './TourOverlay.jsx';

export default function TourTooltip() {
  const {
    isTourActive,
    activeTour,
    activeSteps,
    currentStep,
    targetRect,
    isNavigating,
    nextStep,
    prevStep,
    closeTour,
  } = useTour();

  const [tooltipPos, setTooltipPos] = useState(null);

  useEffect(() => {
    if (!isTourActive) return;
    const step = activeSteps[currentStep];
    if (!step) return;

    const mobile = isMobileViewport();
    if (mobile || !targetRect) {
      setTooltipPos({ top: null, left: null, placement: 'bottom', mobile: true });
      return;
    }

    const tooltipSize = { width: 360, height: 220 };
    const pos = computeTooltipPosition(targetRect, tooltipSize, step.placement || 'bottom');
    setTooltipPos({ ...pos, mobile: false });
  }, [isTourActive, currentStep, targetRect, activeSteps]);

  if (!isTourActive || !activeTour || !activeSteps[currentStep]) return null;

  const step = activeSteps[currentStep];
  const isLast = currentStep === activeSteps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <>
      <TourOverlay targetRect={targetRect} />
      <AnimatePresence>
        <motion.div
          key={`tooltip-${activeTour.id}-${currentStep}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-tooltip-title"
          className="tour-tooltip"
          style={
            tooltipPos && !tooltipPos.mobile
              ? { top: tooltipPos.top, left: tooltipPos.left }
              : { position: 'fixed', bottom: 0, left: 0, right: 0 }
          }
        >
          <div className="tour-tooltip-header">
            <span className="tour-tooltip-badge">
              Step {currentStep + 1} of {activeSteps.length}
            </span>
            <button
              className="tour-tooltip-close"
              onClick={closeTour}
              aria-label="Close tour"
              title="Close tour"
            >
              ✕
            </button>
          </div>

          <h3 id="tour-tooltip-title" className="tour-tooltip-title">
            {step.title}
          </h3>
          <p className="tour-tooltip-body">{step.body}</p>

          {step.hint && (
            <p className="tour-tooltip-hint">
              <span className="tour-tooltip-hint-icon">💡</span> {step.hint}
            </p>
          )}

          <div className="tour-tooltip-progress">
            {activeSteps.map((_, i) => (
              <span
                key={i}
                className={`tour-dot ${i === currentStep ? 'tour-dot-active' : ''} ${i < currentStep ? 'tour-dot-done' : ''}`}
              />
            ))}
          </div>

          <div className="tour-tooltip-controls">
            <button
              className="tour-btn tour-btn-skip"
              onClick={closeTour}
              aria-label="Skip tour"
            >
              Skip
            </button>
            <div className="tour-tooltip-nav">
              <button
                className="tour-btn tour-btn-back"
                onClick={prevStep}
                disabled={isFirst || isNavigating}
                aria-label="Previous step"
              >
                Back
              </button>
              <button
                className="tour-btn tour-btn-next"
                onClick={nextStep}
                disabled={isNavigating}
                aria-label={isLast ? 'Finish tour' : 'Next step'}
              >
                {isNavigating ? 'Loading…' : isLast ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
