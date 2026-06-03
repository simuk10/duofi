'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CATEGORIZATION_FLOW_CHANGED_EVENT,
  readCategorizationFlowMode,
  type CategorizationFlowMode,
  writeCategorizationFlowMode,
} from '@/lib/categorization-flow-preference';

export function useCategorizationFlowMode() {
  const [mode, setModeState] = useState<CategorizationFlowMode>('separate');

  useEffect(() => {
    setModeState(readCategorizationFlowMode());
    const onChange = () => setModeState(readCategorizationFlowMode());
    window.addEventListener(CATEGORIZATION_FLOW_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CATEGORIZATION_FLOW_CHANGED_EVENT, onChange);
  }, []);

  const setMode = useCallback((next: CategorizationFlowMode) => {
    writeCategorizationFlowMode(next);
    setModeState(next);
  }, []);

  return { mode, setMode };
}
