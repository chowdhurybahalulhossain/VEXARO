import { useEffect, useState } from 'react';

// Runs `loader()` (a function that returns a promise) and gives back
// { data, error, loading }. It runs again whenever a value in `deps` changes.
//
//   const { data, error, loading } = useApi(() => api('/products'), []);
export function useApi(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    loader()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, error, loading: false });
      });

    // If the page changes before the answer arrives, ignore the late answer.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
