import { useEffect, useState } from "react";
import { useLiveTranscript } from "../../hooks/useLiveTranscript";
import { useSpeakerRoles } from "../../hooks/useSpeakerRoles";
import { useDismissAlert } from "../../hooks/useDismissAlert";
import { useConversationMemory } from "../../hooks/useConversationMemory";
import { useVideoCapture } from "../../hooks/useVideoCapture";
import { useIdleTimeout } from "../../hooks/useIdleTimeout";
import { useTheme } from "../../theme/ThemeProvider";
import { pcm16ToWavDataUrl } from "../../audio/wav";
import { formatMsAsTimestamp } from "../../utils/time";
import { redactClientPHI } from "../../utils/hipaaRedactor";
import { WaveformMeter } from "../shared/WaveformMeter";
import { SpeakerChip } from "../shared/SpeakerChip";
import { ConfidenceBadge } from "../shared/ConfidenceBadge";
import { RiskBadge } from "../shared/RiskBadge";
import { EmotionIndicator } from "../shared/EmotionIndicator";
import { HighlightedText } from "../shared/HighlightedText";
import { MiscommunicationAlert } from "../alerts/MiscommunicationAlert";
import { EmergencyAlertCard } from "../alerts/EmergencyAlertCard";
import { ConsentBanner } from "../alerts/ConsentBanner";
import { VisionAlertCard } from "../alerts/VisionAlertCard";
import { VideoMonitorPanel } from "./VideoMonitorPanel";
import { ExportModal } from "./ExportModal";
import { ConversationMemoryPanel } from "./ConversationMemoryPanel";
import { MedicalEntitiesPanel } from "./MedicalEntitiesPanel";
import { SummaryPanel } from "./SummaryPanel";
import { DdiAlertBanner, type DrugInteractionItem, type AllergyItem } from "../alerts/DdiAlertBanner";
import { LiveVitalsStrip, type VitalsData } from "./LiveVitalsStrip";
import { PrescriptionSlipModal } from "./PrescriptionSlipModal";
import { TimelineView } from "./TimelineView";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { GATEWAY_HTTP_URL, GATEWAY_WS_URL } from "../../config";
import type { MedicalEntity } from "@medibridge/shared-types";

/** Phase 1-9 scope. Playback uses <audio controls> (no autoplay) so the
 * clinician/patient decides when to hear it -- consistent with
 * "human-in-the-loop always" (Blueprint Section 1). */
export function LiveTranscriptPanel() {
  const { colors } = useTheme();
  const { consentGiven, isActive, events, error, level, start, stop } = useLiveTranscript({
    gatewayWsUrl: GATEWAY_WS_URL,
  });
  const { roleFor, assignRole } = useSpeakerRoles();
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  // Camera consent: strictly false by default (never prompted without explicit user opt-in)
  const [cameraConsented, setCameraConsented] = useState<boolean>(false);
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [hipaaRedactionEnabled, setHipaaRedactionEnabled] = useState<boolean>(true);

  // HIPAA Workstation security: idle timeout lock after inactivity
  const { isLocked, unlock } = useIdleTimeout({ enabled: consentGiven, timeoutMs: 15 * 60 * 1000 });

  const finals = events.filter((e) => e.type === "final" && e.segment);
  const latestPartial = [...events].reverse().find((e) => e.type === "partial" && e.segment);
  const latestSessionId = events.length > 0 ? (events[events.length - 1]?.session_id ?? null) : null;
  const sessionId = latestSessionId && latestSessionId !== "n/a" ? latestSessionId : null;
  const allEntities: MedicalEntity[] = finals.flatMap((e) => [
    ...(e.entities ?? []),
    ...(e.translation_entities ?? []),
  ]);
  const { dismiss: dismissAlert, error: dismissAlertError } = useDismissAlert(sessionId);
  const {
    memory,
    error: memoryError,
    removeCaseMemoryEntry,
    generateSummary,
    approveSummary,
    summaryError,
    isGeneratingSummary,
  } = useConversationMemory(sessionId, finals.length);
  const { alert: visionAlert, clearAlert: clearVisionAlert, mediaStream } = useVideoCapture({
    sessionId,
    enabled: cameraConsented === true,
  });
  // Most recent utterance still carrying an un-dismissed emergency alert --
  // one persistent banner (Blueprint Section 2.2: "persistent ... banner"),
  // not one per matching utterance in the scrolling transcript.
  const activeEmergencyEvent = [...finals]
    .reverse()
    .find((e) => e.emergency?.alert && !dismissedAlertIds.has(e.utterance_id));
  const [vitals, setVitals] = useState<VitalsData>({});
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState<boolean>(false);
  const [cdsInteractions, setCdsInteractions] = useState<DrugInteractionItem[]>([]);
  const [cdsAllergies, setCdsAllergies] = useState<AllergyItem[]>([]);

  useEffect(() => {
    const meds = allEntities
      .filter((e) => e.category === "medication")
      .map((e) => e.canonical_name || e.text);
    const patientUtterances = finals
      .filter((f) => roleFor(f.speaker?.speaker_label ?? "") === "patient")
      .map((f) => f.segment?.text || "");

    if (meds.length > 0 || patientUtterances.length > 0) {
      fetch(`${GATEWAY_HTTP_URL}/cds/check-interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medications: Array.from(new Set(meds)),
          patient_utterances: patientUtterances,
          known_allergies: [],
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setCdsInteractions(data.interactions || []);
            setCdsAllergies(data.allergies || []);
          }
        })
        .catch(() => {});
    }
  }, [allEntities.length, finals.length]);

  return (
    <section aria-label="Live transcript" style={{ color: colors.textPrimary }}>
      {/* Workstation Lock Screen for HIPAA Compliance */}
      {isLocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Session locked"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: colors.surface,
              padding: 32,
              borderRadius: 12,
              textAlign: "center",
              maxWidth: 400,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Workstation Locked</h2>
            <p style={{ color: colors.textSecondary, fontSize: 14 }}>
              Locked after inactivity for patient privacy and HIPAA compliance (§ 164.312).
            </p>
            <button
              onClick={unlock}
              style={{
                background: colors.primary,
                color: "#fff",
                padding: "10px 24px",
                borderRadius: 6,
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: 12,
              }}
            >
              Resume Consultation
            </button>
          </div>
        </div>
      )}

      {/* Camera consent modal -- ONLY shown when clinician explicitly opts in */}
      {showConsentModal && (
        <ConsentBanner
          onConsent={(consented) => {
            setCameraConsented(consented);
            setShowConsentModal(false);
          }}
        />
      )}
      {visionAlert && (
        <VisionAlertCard reason={visionAlert.reason} onAcknowledge={clearVisionAlert} />
      )}
      {cameraConsented && mediaStream && (
        <VideoMonitorPanel
          stream={mediaStream}
          onDisable={() => setCameraConsented(false)}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        {!consentGiven ? (
          <button onClick={() => void start()}>Start consultation (I consent to audio recording)</button>
        ) : (
          <button onClick={stop}>Stop consultation</button>
        )}
        <WaveformMeter level={level} label="Microphone" active={isActive} />

        {/* HIPAA Safe Harbor De-identification Toggle */}
        <button
          onClick={() => setHipaaRedactionEnabled(!hipaaRedactionEnabled)}
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 16,
            border: "1px solid",
            borderColor: hipaaRedactionEnabled ? colors.success : colors.border,
            background: hipaaRedactionEnabled ? "rgba(16, 185, 129, 0.12)" : "transparent",
            color: hipaaRedactionEnabled ? colors.success : colors.textSecondary,
            cursor: "pointer",
            fontWeight: 500,
          }}
          title="Toggle client-side HIPAA Safe Harbor 18 PHI redaction"
        >
          {hipaaRedactionEnabled ? "🔒 HIPAA Safe Harbor: Redacting PHI" : "🔓 HIPAA Redaction: Off"}
        </button>

        {/* Export Consultation Record */}
        <button
          onClick={() => setIsExportOpen(true)}
          style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}
        >
          📄 Export Record
        </button>

        {/* Official Prescription Slip */}
        <button
          onClick={() => setIsPrescriptionOpen(true)}
          style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}
          title="Open printable official clinical prescription (Rx) slip"
        >
          💊 Prescription (Rx)
        </button>

        {/* Camera Safety Monitoring Toggle (100% Opt-In) */}
        {!cameraConsented ? (
          <button
            onClick={() => setShowConsentModal(true)}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, opacity: 0.85, cursor: "pointer" }}
            title="Enable optional video safety monitoring for patient collapse or fall detection"
          >
            📷 Camera Safety (Opt-in)
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.success }}>
            <span>🟢 Camera Active</span>
            <button
              onClick={() => setCameraConsented(false)}
              style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
            >
              Disable
            </button>
          </div>
        )}
      </div>

      <p role="status">{isActive ? "Recording" : consentGiven ? "Connecting…" : "Not recording"}</p>

      {error && (
        <p role="alert" style={{ color: colors.danger }}>
          {error}
        </p>
      )}

      {activeEmergencyEvent?.emergency?.reason && (
        <EmergencyAlertCard
          key={activeEmergencyEvent.utterance_id}
          utteranceId={activeEmergencyEvent.utterance_id}
          reason={activeEmergencyEvent.emergency.reason}
          onDismiss={async (reason) => {
            const logged = await dismissAlert(reason, activeEmergencyEvent.utterance_id);
            setDismissedAlertIds((prev) => new Set(prev).add(activeEmergencyEvent.utterance_id));
            return logged;
          }}
        />
      )}

      {/* CDS Drug-Drug Interaction and Allergy Warning Banner */}
      <DdiAlertBanner
        interactions={cdsInteractions}
        allergies={cdsAllergies}
        onDismiss={() => {
          setCdsInteractions([]);
          setCdsAllergies([]);
        }}
      />

      {/* Real-Time Clinical Vitals Telemetry Strip */}
      <LiveVitalsStrip
        utterances={finals.map((f) => f.segment?.text || "")}
        initialVitals={vitals}
        onVitalsChange={setVitals}
      />
      {dismissAlertError && (
        <p role="alert" style={{ color: colors.warning, fontSize: 12 }}>
          {dismissAlertError}
        </p>
      )}

      <ul aria-live="polite" aria-label="Transcript">
        {finals.map((event) => (
          <li key={event.utterance_id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: colors.textSecondary, fontSize: 12 }}>
                {event.segment && formatMsAsTimestamp(event.segment.start_ms)}–
                {event.segment && formatMsAsTimestamp(event.segment.end_ms)}
              </span>
              {event.speaker && (
                <SpeakerChip
                  speakerLabel={event.speaker.speaker_label}
                  confidence={event.speaker.confidence}
                  role={roleFor(event.speaker.speaker_label)}
                  onAssignRole={(role) => assignRole(event.speaker!.speaker_label, role)}
                />
              )}
              {event.speaker_error && (
                <span role="alert" style={{ color: colors.warning, fontSize: 12 }}>
                  Speaker unknown: {event.speaker_error}
                </span>
              )}
              {event.confidence_v2 !== null && event.confidence_band !== null && (
                <ConfidenceBadge score={event.confidence_v2} band={event.confidence_band} />
              )}
              {event.emotion && (
                <EmotionIndicator
                  label={event.emotion.label}
                  confidence={event.emotion.confidence}
                  reason={event.emotion.reason}
                  disclaimer={event.emotion.disclaimer}
                />
              )}
            </div>
            {event.emotion_error && (
              <div role="alert" style={{ color: colors.warning, fontSize: 12 }}>
                Tone assessment unavailable: {event.emotion_error}
              </div>
            )}
            {event.risk && <RiskBadge level={event.risk.level} reason={event.risk.reason} />}
            {event.risk_error && (
              <div role="alert" style={{ color: colors.warning, fontSize: 12 }}>
                Risk assessment unavailable: {event.risk_error}
              </div>
            )}
            {event.emergency_error && (
              <div role="alert" style={{ color: colors.warning, fontSize: 12 }}>
                Emergency keyword check unavailable: {event.emergency_error}
              </div>
            )}

            <div>
              {event.segment && (
                <HighlightedText
                  text={hipaaRedactionEnabled ? redactClientPHI(event.segment.text).redactedText : event.segment.text}
                  entities={event.entities}
                />
              )}
            </div>
            {event.entities_error && (
              <div role="alert" style={{ color: colors.warning, fontSize: 12 }}>
                Medical term detection unavailable: {event.entities_error}
              </div>
            )}

            {event.translation && (
              <div style={{ color: colors.textSecondary }}>
                <HighlightedText
                  text={
                    hipaaRedactionEnabled
                      ? redactClientPHI(event.translation.text).redactedText
                      : event.translation.text
                  }
                  entities={event.translation_entities}
                />
              </div>
            )}
            {event.translation_entities_error && (
              <div role="alert" style={{ color: colors.warning, fontSize: 12 }}>
                Medical term detection unavailable (translation): {event.translation_entities_error}
              </div>
            )}
            {event.translation_error && (
              <div role="alert" style={{ color: colors.warning }}>
                Translation unavailable: {event.translation_error}
              </div>
            )}

            {event.miscommunication && !event.miscommunication.consistent && (
              <MiscommunicationAlert result={event.miscommunication} />
            )}
            {event.miscommunication_error && (
              <div role="alert" style={{ color: colors.warning, fontSize: 12 }}>
                Miscommunication check unavailable: {event.miscommunication_error}
              </div>
            )}

            {event.tts && (
              <audio controls src={pcm16ToWavDataUrl(event.tts.audio_base64, event.tts.sample_rate)} />
            )}
            {event.tts_error && (
              <div role="alert" style={{ color: colors.warning }}>
                Audio playback unavailable: {event.tts_error}
              </div>
            )}
          </li>
        ))}
        {latestPartial && <li style={{ opacity: 0.6 }}>{latestPartial.segment?.text} …</li>}
      </ul>

      <MedicalEntitiesPanel entities={allEntities} />

      <AnalyticsDashboard finals={finals} />

      <ConversationMemoryPanel
        sessionId={sessionId}
        memory={memory}
        error={memoryError}
        removeCaseMemoryEntry={removeCaseMemoryEntry}
      />

      <SummaryPanel
        sessionId={sessionId}
        summary={memory?.draft_summary ?? null}
        approved={memory?.summary_approved ?? false}
        error={summaryError}
        isGenerating={isGeneratingSummary}
        onGenerate={() => void generateSummary()}
        onApprove={() => void approveSummary()}
      />

      <TimelineView sessionId={sessionId} events={memory?.timeline ?? []} />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        sessionId={sessionId}
        events={events}
        entities={allEntities}
        summary={memory?.draft_summary ?? null}
      />

      <PrescriptionSlipModal
        isOpen={isPrescriptionOpen}
        onClose={() => setIsPrescriptionOpen(false)}
        summary={memory?.draft_summary ?? null}
        vitals={vitals}
        sessionId={sessionId}
      />
    </section>
  );
}
