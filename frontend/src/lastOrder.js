const KEY = 'vexaro_last_order';

// Kept in sessionStorage: it lives only in this browser tab and disappears when the tab is closed.
export function saveLastOrder(order) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch (err) {
    // Storage can be blocked (private mode). The success page still works from navigation state.
  }
}

export function loadLastOrder() {
  try {
    const text = sessionStorage.getItem(KEY);
    return text ? JSON.parse(text) : null;
  } catch (err) {
    return null;
  }
}
