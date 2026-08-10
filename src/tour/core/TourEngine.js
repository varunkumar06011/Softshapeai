const ELEMENT_WAIT_TIMEOUT = 8000;
const ELEMENT_WAIT_INTERVAL = 100;

export function findTargetElement(selector) {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export function waitForElement(selector, timeout = ELEMENT_WAIT_TIMEOUT) {
  return new Promise((resolve) => {
    const el = findTargetElement(selector);
    if (el) {
      resolve(el);
      return;
    }

    const start = Date.now();
    let observer = null;

    const checkInterval = setInterval(() => {
      const found = findTargetElement(selector);
      if (found) {
        clearInterval(checkInterval);
        if (observer) observer.disconnect();
        resolve(found);
      } else if (Date.now() - start > timeout) {
        clearInterval(checkInterval);
        if (observer) observer.disconnect();
        resolve(null);
      }
    }, ELEMENT_WAIT_INTERVAL);

    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        const found = findTargetElement(selector);
        if (found) {
          clearInterval(checkInterval);
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
}

export function scrollToElement(el) {
  if (!el) return;
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch {
    /* ignore */
  }
}

export function getElementRect(el) {
  if (!el) return null;
  try {
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

export function evaluateCondition(step, context) {
  if (!step.condition) return true;
  try {
    return step.condition(context);
  } catch {
    return true;
  }
}

export function filterSteps(steps, context) {
  const result = [];
  for (const step of steps) {
    if (evaluateCondition(step, context)) {
      result.push(step);
    }
  }
  return result;
}

export function computeTooltipPosition(targetRect, tooltipSize, placement) {
  if (!targetRect) {
    return { top: window.innerHeight - tooltipSize.height - 20, left: 20, placement: 'bottom' };
  }

  const margin = 12;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let top, left, actualPlacement = placement;

  const spaceAbove = targetRect.top;
  const spaceBelow = viewportH - targetRect.bottom;
  const spaceLeft = targetRect.left;
  const spaceRight = viewportW - targetRect.right;

  if (placement === 'top' && spaceAbove < tooltipSize.height + margin) {
    actualPlacement = 'bottom';
  } else if (placement === 'bottom' && spaceBelow < tooltipSize.height + margin) {
    actualPlacement = 'top';
  } else if (placement === 'left' && spaceLeft < tooltipSize.width + margin) {
    actualPlacement = 'right';
  } else if (placement === 'right' && spaceRight < tooltipSize.width + margin) {
    actualPlacement = 'left';
  }

  switch (actualPlacement) {
    case 'top':
      top = targetRect.top - tooltipSize.height - margin;
      left = targetRect.left + (targetRect.width - tooltipSize.width) / 2;
      break;
    case 'bottom':
      top = targetRect.bottom + margin;
      left = targetRect.left + (targetRect.width - tooltipSize.width) / 2;
      break;
    case 'left':
      top = targetRect.top + (targetRect.height - tooltipSize.height) / 2;
      left = targetRect.left - tooltipSize.width - margin;
      break;
    case 'right':
      top = targetRect.top + (targetRect.height - tooltipSize.height) / 2;
      left = targetRect.right + margin;
      break;
    default:
      top = targetRect.bottom + margin;
      left = targetRect.left + (targetRect.width - tooltipSize.width) / 2;
      actualPlacement = 'bottom';
  }

  if (left < margin) left = margin;
  if (left + tooltipSize.width > viewportW - margin) left = viewportW - tooltipSize.width - margin;
  if (top < margin) top = margin;
  if (top + tooltipSize.height > viewportH - margin) top = viewportH - tooltipSize.height - margin;

  return { top, left, placement: actualPlacement };
}

export function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}
