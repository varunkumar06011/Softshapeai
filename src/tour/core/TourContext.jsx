import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { getCurrentRestaurantId } from '../../utils/getCurrentRestaurantId.js';
import {
  getTourProgress,
  setTourCompleted,
  setTourDismissed,
  saveTourStep,
  clearTourProgress,
  markAutoShown,
  getAllTourProgress,
  resetDeviceTourState,
} from './TourState.js';
import { getTour, getToursForRole, getToursForPortal } from './TourRegistry.js';
import { filterSteps, waitForElement, scrollToElement, findTargetElement } from './TourEngine.js';

const TourContext = createContext(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) return { isTourActive: false, activeTour: null, currentStep: 0, startTour: () => {}, closeTour: () => {}, nextStep: () => {}, prevStep: () => {}, restartTour: () => {}, tourCenterOpen: false, setTourCenterOpen: () => {}, availableTours: [], tourProgress: {} };
  return ctx;
}

export function TourProvider({ children }) {
  const { user, restaurant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const userId = user?.id || 'anon';
  const restaurantId = restaurant?.id || getCurrentRestaurantId() || 'unknown';
  const role = user?.role || 'visitor';
  const enabledModules = restaurant?.enabledModules || {};

  const [isTourActive, setIsTourActive] = useState(false);
  const [activeTour, setActiveTour] = useState(null);
  const [activeSteps, setActiveSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [tourCenterOpen, setTourCenterOpen] = useState(false);
  const [availableTours, setAvailableTours] = useState([]);
  const [tourProgress, setTourProgress] = useState({});
  const [autoShowChecked, setAutoShowChecked] = useState(false);

  const activeTourRef = useRef(null);
  const currentStepRef = useRef(0);
  const activeStepsRef = useRef([]);

  useEffect(() => { activeTourRef.current = activeTour; }, [activeTour]);
  useEffect(() => { currentStepRef.current = currentStepIndex; }, [currentStepIndex]);
  useEffect(() => { activeStepsRef.current = activeSteps; }, [activeSteps]);

  const buildContext = useCallback(() => ({
    user,
    restaurant,
    role,
    enabledModules,
    restaurantId,
    location: location.pathname,
  }), [user, restaurant, role, enabledModules, restaurantId, location.pathname]);

  const refreshAvailableTours = useCallback(() => {
    const tours = getToursForRole(role, enabledModules);
    setAvailableTours(tours);
    setTourProgress(getAllTourProgress(userId, restaurantId));
  }, [role, enabledModules, userId, restaurantId]);

  useEffect(() => {
    refreshAvailableTours();
  }, [refreshAvailableTours]);

  const updateTargetRect = useCallback((step) => {
    if (!step || !step.target) {
      setTargetRect(null);
      return;
    }
    const el = findTargetElement(step.target);
    if (el) {
      scrollToElement(el);
      requestAnimationFrame(() => {
        try {
          setTargetRect(el.getBoundingClientRect());
        } catch {
          setTargetRect(null);
        }
      });
    } else {
      setTargetRect(null);
    }
  }, []);

  const executeStep = useCallback(async (stepIndex) => {
    const steps = activeStepsRef.current;
    if (stepIndex < 0 || stepIndex >= steps.length) return;

    const step = steps[stepIndex];

    if (step.route) {
      const currentPath = window.location.pathname;
      if (!currentPath.includes(step.route)) {
        setIsNavigating(true);
        navigate(step.route);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    if (step.target) {
      const el = await waitForElement(step.target, 8000);
      if (el) {
        scrollToElement(el);
        await new Promise((resolve) => setTimeout(resolve, 300));
        try {
          setTargetRect(el.getBoundingClientRect());
        } catch {
          setTargetRect(null);
        }
      } else {
        console.warn(`[Tour] Target not found: ${step.target}, auto-skipping step ${stepIndex + 1}`);
        setTargetRect(null);
        setIsNavigating(false);
        if (stepIndex + 1 < steps.length) {
          setCurrentStepIndex(stepIndex + 1);
          currentStepRef.current = stepIndex + 1;
          await executeStep(stepIndex + 1);
        } else {
          const tour = activeTourRef.current;
          if (tour) {
            setTourCompleted(userId, restaurantId, tour.id, tour.version);
          }
          setIsTourActive(false);
          setActiveTour(null);
          setActiveSteps([]);
          setTargetRect(null);
          refreshAvailableTours();
        }
        return;
      }
    } else {
      setTargetRect(null);
    }

    setIsNavigating(false);
  }, [navigate, userId, restaurantId, refreshAvailableTours]);

  const startTour = useCallback(async (tourId, opts = {}) => {
    const tour = getTour(tourId);
    if (!tour) {
      console.warn(`[Tour] Tour not found: ${tourId}`);
      return;
    }

    const ctx = buildContext();
    const filtered = filterSteps(tour.steps, ctx);
    if (filtered.length === 0) {
      console.warn(`[Tour] No visible steps for tour: ${tourId}`);
      return;
    }

    if (!opts.silent) {
      markAutoShown(restaurantId, tourId, tour.version);
    }

    setActiveTour(tour);
    setActiveSteps(filtered);
    activeStepsRef.current = filtered;
    setCurrentStepIndex(0);
    currentStepRef.current = 0;
    setIsTourActive(true);

    if (tour.startRoute) {
      const currentPath = window.location.pathname;
      if (!currentPath.includes(tour.startRoute)) {
        setIsNavigating(true);
        navigate(tour.startRoute);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    await executeStep(0);
    saveTourStep(userId, restaurantId, tourId, tour.version, 0);
  }, [buildContext, executeStep, navigate, userId, restaurantId]);

  const nextStep = useCallback(async () => {
    const steps = activeStepsRef.current;
    const nextIdx = currentStepRef.current + 1;
    if (nextIdx >= steps.length) {
      const tour = activeTourRef.current;
      if (tour) {
        setTourCompleted(userId, restaurantId, tour.id, tour.version);
      }
      setIsTourActive(false);
      setActiveTour(null);
      setActiveSteps([]);
      setTargetRect(null);
      refreshAvailableTours();
      return;
    }
    setCurrentStepIndex(nextIdx);
    currentStepRef.current = nextIdx;
    await executeStep(nextIdx);
    const tour = activeTourRef.current;
    if (tour) {
      saveTourStep(userId, restaurantId, tour.id, tour.version, nextIdx);
    }
  }, [executeStep, userId, restaurantId, refreshAvailableTours]);

  const prevStep = useCallback(async () => {
    const prevIdx = currentStepRef.current - 1;
    if (prevIdx < 0) return;
    setCurrentStepIndex(prevIdx);
    currentStepRef.current = prevIdx;
    await executeStep(prevIdx);
  }, [executeStep]);

  const closeTour = useCallback((opts = {}) => {
    const tour = activeTourRef.current;
    if (tour && !opts.completed) {
      setTourDismissed(userId, restaurantId, tour.id, tour.version);
    }
    setIsTourActive(false);
    setActiveTour(null);
    setActiveSteps([]);
    setTargetRect(null);
    refreshAvailableTours();
  }, [userId, restaurantId, refreshAvailableTours]);

  const skipTour = useCallback(() => {
    closeTour();
  }, [closeTour]);

  const restartTour = useCallback(async (tourId) => {
    const tour = getTour(tourId);
    if (!tour) return;
    clearTourProgress(userId, restaurantId, tourId, tour.version);
    resetDeviceTourState(restaurantId, tourId, tour.version);
    refreshAvailableTours();
    await startTour(tourId, { silent: true });
  }, [userId, restaurantId, startTour, refreshAvailableTours]);

  useEffect(() => {
    if (!isTourActive) return;
    const handleResize = () => {
      const step = activeStepsRef.current[currentStepRef.current];
      if (step && step.target) {
        const el = findTargetElement(step.target);
        if (el) {
          try {
            setTargetRect(el.getBoundingClientRect());
          } catch {
            /* ignore */
          }
        }
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, [isTourActive]);

  useEffect(() => {
    if (!isTourActive) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTour();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isTourActive, closeTour, nextStep, prevStep]);

  useEffect(() => {
    if (autoShowChecked || isTourActive) return;
    // Auto-showing a tour renders a full-screen overlay (pointer-events: all,
    // z-index 9998) that blocks all clicks except on the highlighted element.
    // On the landing page this prevents users from clicking portal buttons
    // (e.g. Cashier Panel) to log in. Tours remain available on-demand via
    // the "Guide" FAB — do not auto-start them.
    setAutoShowChecked(true);
  }, [autoShowChecked, isTourActive]);

  const value = {
    isTourActive,
    activeTour,
    activeSteps,
    currentStep: currentStepIndex,
    targetRect,
    isNavigating,
    tourCenterOpen,
    setTourCenterOpen,
    availableTours,
    tourProgress,
    startTour,
    nextStep,
    prevStep,
    closeTour,
    skipTour,
    restartTour,
    refreshAvailableTours,
    userId,
    restaurantId,
    role,
    enabledModules,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
}
