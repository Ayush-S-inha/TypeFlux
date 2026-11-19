function closeTracker(tracker) {
  try {
    tracker.close();
  } catch (error) {
    console.warn('TypeFlux could not release a tracking resource:', error);
  }
}

export function createTrackerRegistry() {
  const trackers = new Set();
  let disposed = false;

  return {
    add(tracker) {
      if (!tracker || typeof tracker.close !== 'function') return tracker;
      if (disposed) closeTracker(tracker);
      else trackers.add(tracker);
      return tracker;
    },
    closeAll() {
      if (disposed) return;
      disposed = true;
      for (const tracker of trackers) closeTracker(tracker);
      trackers.clear();
    },
  };
}

const trackerRegistry = createTrackerRegistry();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) trackerRegistry.closeAll();
  });
}

export function registerTracker(tracker) {
  return trackerRegistry.add(tracker);
}
