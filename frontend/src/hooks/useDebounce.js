import { useEffect, useState } from 'react';

// Delays updating the returned value until the input value has stopped
// changing for `delay` ms — used to avoid firing a search request on
// every keystroke.
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
