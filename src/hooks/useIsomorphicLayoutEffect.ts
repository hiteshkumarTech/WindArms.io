import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` that silently falls back to `useEffect` during SSR,
 * avoiding React server-render warnings in client components.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
