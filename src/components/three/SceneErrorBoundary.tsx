'use client';

import { Component, type ReactNode } from 'react';
import BackgroundFallback from './BackgroundFallback';

interface SceneErrorBoundaryProps {
  children: ReactNode;
}

interface SceneErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches WebGL context / renderer failures (old GPUs, disabled WebGL)
 * and swaps the 3D scene for a static ambient fallback.
 */
export default class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <BackgroundFallback />;
    }
    return this.props.children;
  }
}
