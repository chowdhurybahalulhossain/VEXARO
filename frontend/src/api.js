const TOKEN_KEY = 'vexaro_token';
const SESSION_KEY = 'vexaro_session';

// Guests are told apart by a random id kept in the browser.
// The backend uses it as the "x-session-id" header for the cart.
export function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) ||
      `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// Talks to the backend:  api('/products?limit=8')
// POST example:          api('/cart', { method: 'POST', body: { variant_id: 1, quantity: 2 } })
// On a failed request it throws an Error whose message is safe to show to the customer.
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'x-session-id': getSessionId() };

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new Error('Cannot reach the server. Make sure the backend is running.');
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error((data && data.error) || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

// The category list is needed by the header and the homepage, so it is fetched once.
let categoriesPromise = null;
export function getCategories() {
  if (!categoriesPromise) {
    categoriesPromise = api('/categories').catch((err) => {
      categoriesPromise = null;
      throw err;
    });
  }
  return categoriesPromise;
}
