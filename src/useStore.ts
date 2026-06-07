import { useEffect, useReducer } from 'react';
import { store } from './core/store';

// Subscribe a component to the store: re-render on every emit(). Components read
// the current project/pattern straight off the singleton.
export function useStore() {
  const [, force] = useReducer((c: number) => c + 1, 0);
  useEffect(() => store.subscribe(force), []);
  return store;
}
