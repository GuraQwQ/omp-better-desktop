import { useEffect, useState } from 'react';
import { AGENT_FOCUS_EVENT, type AgentFocusDetail } from './agents-state';

export function useAgentFocus(identity: string, open: () => void) {
  const [focusAgentId, setFocusAgentId] = useState<string>();
  useEffect(() => { setFocusAgentId(undefined); }, [identity]);
  useEffect(() => {
    const focus = (event: Event) => {
      const detail = (event as CustomEvent<AgentFocusDetail>).detail;
      if (!detail?.id) return;
      setFocusAgentId(detail.id);
      open();
    };
    window.addEventListener(AGENT_FOCUS_EVENT, focus);
    return () => window.removeEventListener(AGENT_FOCUS_EVENT, focus);
  }, [open]);
  return { focusAgentId, onAgentFocused: () => setFocusAgentId(undefined) };
}
