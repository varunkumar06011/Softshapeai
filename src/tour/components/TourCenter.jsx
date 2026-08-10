import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle, RotateCcw, Play, CheckCircle, Circle } from 'lucide-react';
import { useTour } from '../core/TourContext.jsx';
import { getTourProgress } from '../core/TourState.js';

export default function TourCenter() {
  const {
    tourCenterOpen,
    setTourCenterOpen,
    availableTours,
    startTour,
    restartTour,
    userId,
    restaurantId,
    role,
    enabledModules,
  } = useTour();

  const toursByCategory = useMemo(() => {
    const cats = {};
    for (const tour of availableTours) {
      const cat = tour.category || 'General';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(tour);
    }
    return cats;
  }, [availableTours]);

  const categoryOrder = ['Getting Started', 'Landing', 'Onboarding', 'Admin', 'Cashier', 'Captain', 'Cloud Sync', 'General'];

  const sortedCategories = Object.keys(toursByCategory).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <AnimatePresence>
      {tourCenterOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="tour-center-backdrop"
            onClick={() => setTourCenterOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="tour-center-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-center-title"
          >
            <div className="tour-center-header">
              <div className="tour-center-title-row">
                <HelpCircle size={24} className="text-[#E53935]" />
                <h2 id="tour-center-title">Tour Guide & Help Center</h2>
              </div>
              <button
                onClick={() => setTourCenterOpen(false)}
                className="tour-center-close"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="tour-center-body">
              <p className="tour-center-intro">
                Choose a tour below to learn how to use Softshape. You can start, restart, or review any tour at any time.
              </p>

              {sortedCategories.length === 0 && (
                <div className="tour-center-empty">
                  No tours available for your role. Contact your administrator if you believe this is an error.
                </div>
              )}

              {sortedCategories.map((category) => (
                <div key={category} className="tour-center-category">
                  <h3 className="tour-center-category-title">{category}</h3>
                  <div className="tour-center-tour-list">
                    {toursByCategory[category].map((tour) => {
                      const progress = getTourProgress(userId, restaurantId, tour.id, tour.version);
                      return (
                        <div key={tour.id} className="tour-center-tour-item">
                          <div className="tour-center-tour-info">
                            <div className="tour-center-tour-name">
                              {progress.completed ? (
                                <CheckCircle size={18} className="tour-status-completed" />
                              ) : (
                                <Circle size={18} className="tour-status-pending" />
                              )}
                              <span>{tour.name}</span>
                            </div>
                            {tour.description && (
                              <p className="tour-center-tour-desc">{tour.description}</p>
                            )}
                            <span className="tour-center-tour-meta">
                              {progress.completed ? 'Completed' : progress.dismissed ? 'Dismissed' : 'Not started'}
                              {' · '}
                              {tour.steps.length} step{tour.steps.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="tour-center-tour-actions">
                            <button
                              className="tour-center-btn tour-center-btn-start"
                              onClick={() => {
                                setTourCenterOpen(false);
                                startTour(tour.id, { silent: true });
                              }}
                            >
                              <Play size={14} /> {progress.completed ? 'Replay' : 'Start'}
                            </button>
                            {(progress.completed || progress.dismissed) && (
                              <button
                                className="tour-center-btn tour-center-btn-restart"
                                onClick={() => {
                                  setTourCenterOpen(false);
                                  restartTour(tour.id);
                                }}
                                title="Reset progress and restart"
                              >
                                <RotateCcw size={14} /> Restart
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
