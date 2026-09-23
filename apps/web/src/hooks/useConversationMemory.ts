import { useCallback, useEffect, useState } from "react";
import { GATEWAY_HTTP_URL } from "../config";

export interface CaseMemoryEntry {
  id: string;
  category: "symptom" | "medication" | "allergy";
  value: string;
  source_utterance_id: string | null;
}

export interface Utterance {
  id: string;
  speaker: string | null;
  original_text: string;
  translated_text: string | null;
  sequence: number;
}

export interface DismissedAlert {
  id: string;
  reason: string;
  source_utterance_id: string | null;
}

export type TimelineEventType =
  | "symptom_mentioned"
  | "medication_mentioned"
  | "alert_triggered"
  | "alert_dismissed"
  | "risk_level_changed";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  description: string;
  source_utterance_id: string | null;
  timestamp: string;
}

export interface SummaryBullet {
  text: string;
  source_utterance_id: string;
}

export interface StructuredSummary {
  patient_info: string | null;
  complaints: SummaryBullet[];
  symptoms: SummaryBullet[];
  objective: SummaryBullet[];
  diagnoses_mentioned: SummaryBullet[];
  medications: SummaryBullet[];
  recommendations: SummaryBullet[];
  action_items: SummaryBullet[];
  follow_up: SummaryBullet[];
  discarded_ungrounded_count: number;
  model_name: string;
}

export interface SessionMemory {
  session_id: string;
  utterances: Utterance[];
  case_memory: CaseMemoryEntry[];
  dismissed_alerts: DismissedAlert[];
  timeline: TimelineEvent[];
  draft_summary: StructuredSummary | null;
  summary_approved: boolean;
}

export interface UseConversationMemoryOptions {
  fetchImpl?: typeof fetch;
  gatewayHttpUrl?: string;
}

/**
 * Fetches conversation memory (Blueprint Section 2.2/2.4) via gateway's
 * proxy to orchestrator. `refreshTrigger` lets the caller re-fetch on a
 * meaningful event (e.g. a new final transcript) rather than polling --
 * eventually consistent with orchestrator's store, since speech-pipeline
 * records utterances as a best-effort side effect *after* delivering the
 * transcript event to the client (see
 * services/speech-pipeline/app/orchestrator_client.py), so a refresh
 * immediately after a final event can occasionally still show the
 * previous utterance count. Acceptable per Blueprint Section 3.3 (this
 * path may lag); a real push mechanism is a documented follow-up.
 */
export function useConversationMemory(
  sessionId: string | null,
  refreshTrigger: number,
  options: UseConversationMemoryOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const gatewayHttpUrl = options.gatewayHttpUrl ?? GATEWAY_HTTP_URL;
  const [memory, setMemory] = useState<SessionMemory | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error` -- summary generation is a slower, more
  // failure-prone LLM call than the memory fetch itself, and shouldn't
  // clobber (or be clobbered by) an unrelated memory-fetch error.
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetchImpl(`${gatewayHttpUrl}/sessions/${sessionId}/memory`);
      if (response.status === 404) {
        // Session exists in gateway but orchestrator has no utterances yet —
        // normal at the start of a consultation before the first transcript event.
        setMemory(null);
        setError(null);
        return;
      }
      if (!response.ok) {
        setError(`Conversation memory unavailable (status ${response.status})`);
        return;
      }
      setMemory((await response.json()) as SessionMemory);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversation memory unavailable");
    }
  }, [sessionId, fetchImpl, gatewayHttpUrl]);

  // refreshTrigger is a bump counter (not read inside refresh) that lets
  // the caller force a re-fetch on a meaningful event.
  useEffect(() => {
    void refresh();
  }, [refresh, refreshTrigger]);

  const removeCaseMemoryEntry = useCallback(
    async (entryId: string) => {
      if (!sessionId) return;
      try {
        await fetchImpl(`${gatewayHttpUrl}/sessions/${sessionId}/case-memory/${entryId}`, {
          method: "DELETE",
        });
      } finally {
        await refresh();
      }
    },
    [sessionId, fetchImpl, gatewayHttpUrl, refresh],
  );

  const generateSummary = useCallback(async () => {
    if (!sessionId) return;
    setIsGeneratingSummary(true);
    try {
      const response = await fetchImpl(`${gatewayHttpUrl}/sessions/${sessionId}/summary/generate`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: null }));
        setSummaryError(
          (body as { detail?: string }).detail ?? `Summary generation failed (status ${response.status})`,
        );
        return;
      }
      setSummaryError(null);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Summary generation failed");
    } finally {
      setIsGeneratingSummary(false);
      await refresh();
    }
  }, [sessionId, fetchImpl, gatewayHttpUrl, refresh]);

  const approveSummary = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetchImpl(`${gatewayHttpUrl}/sessions/${sessionId}/summary/approve`, {
        method: "POST",
      });
      if (!response.ok) {
        setSummaryError(`Approval failed (status ${response.status})`);
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      await refresh();
    }
  }, [sessionId, fetchImpl, gatewayHttpUrl, refresh]);

  return {
    memory,
    error,
    removeCaseMemoryEntry,
    generateSummary,
    approveSummary,
    summaryError,
    isGeneratingSummary,
  };
}
