const registry = new Map();

export function registerTour(tourDef) {
  if (!tourDef || !tourDef.id) return;
  registry.set(tourDef.id, tourDef);
}

export function registerTours(tours) {
  if (!Array.isArray(tours)) return;
  tours.forEach(registerTour);
}

export function getTour(tourId) {
  return registry.get(tourId) || null;
}

export function getAllTours() {
  return Array.from(registry.values());
}

export function getToursForRole(role, enabledModules = {}) {
  return getAllTours().filter((tour) => {
    if (!tour.roles || tour.roles.length === 0) return true;
    if (!tour.roles.includes(role)) return false;
    if (tour.requiredModules) {
      for (const mod of tour.requiredModules) {
        if (!enabledModules[mod]) return false;
      }
    }
    return true;
  });
}

export function getToursForPortal(portal, role, enabledModules = {}) {
  return getToursForRole(role, enabledModules).filter((tour) => {
    if (!tour.portal) return true;
    return tour.portal === portal;
  });
}

export function clearRegistry() {
  registry.clear();
}
