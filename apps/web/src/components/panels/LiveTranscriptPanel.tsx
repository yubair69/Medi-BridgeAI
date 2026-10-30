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
import { WaveVisualizer } from "../shared/WaveVisualizer";
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

export function LiveTranscriptPanel() {
  const { colors, mode } = useTheme();
  const { consentGiven, isActive, events, error, level, start, stop } = useLiveTranscript({
    gatewayWsUrl: GATEWAY_WS_URL,
  });
  const { roleFor, assignRole } = useSpeakerRoles();
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const [cameraConsented, setCameraConsented] = useState<boolean>(false);
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [hipaaRedactionEnabled, setHipaaRedactionEnabled] = useState<boolean>(true);

  // HIPAA Workstation security: idle timeout lock after inactivity
  const { isLocked, unlock } = useIdleTimeout({ enabled: consentGiven, timeoutMs: 15 * 60 * 1000 });

  const finals = events.filter((e) => e.type === "final" && e.segment);
  const latestPartial = [...events].reverse().find((e) => e.type === "partial" && e.segment);
  const latestFinal = finals.length > 0 ? finals[finals.length - 1] : null;
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
  const { alert: visionAlert, clearAlert: clearVisionAlert, mediaStream, facePosition } = useVideoCapture({
    sessionId,
    enabled: cameraConsented === true,
  });

  const activeEmergencyEvent = [...finals]
    .reverse()
    .find((e) => e.emergency?.alert && !dismissedAlertIds.has(e.utterance_id));
  const [vitals, setVitals] = useState<VitalsData>({});
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState<boolean>(false);
  const [cdsInteractions, setCdsInteractions] = useState<DrugInteractionItem[]>([]);
  const [cdsAllergies, setCdsAllergies] = useState<AllergyItem[]>([]);

  // Automatically check drug-drug interactions and allergies as utterances & entities arrive
  useEffect(() => {
    const meds = allEntities
      .filter((e) => e.category === "medication")
      .map((e) => (e.canonical_name || e.text).replace(/^#+/, "").trim())
      .filter((m) => m.length >= 3);
    const patientUtterances = finals.map((f) => f.segment?.text || "");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEntities.length, finals.length]);

  const handleStopConsultation = () => {
    stop();
    if (sessionId && !memory?.draft_summary && !isGeneratingSummary) {
      void generateSummary();
    }
  };

  const isDark = mode === "dark";

  return (
    <section
      aria-label="Live transcript"
      style={{
        color: colors.textPrimary,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "relative",
      }}
    >
      {/* Workstation Lock Screen for HIPAA Compliance */}
      {isLocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Session locked"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 15, 29, 0.92)",
            backdropFilter: "blur(12px)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: colors.surface,
              padding: 36,
              borderRadius: 16,
              textAlign: "center",
              maxWidth: 420,
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>Workstation Locked</h2>
            <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
              Locked after inactivity for patient privacy and HIPAA compliance (§ 164.312).
            </p>
            <button
              onClick={unlock}
              style={{
                background: colors.primary,
                color: "#fff",
                padding: "10px 28px",
                borderRadius: 8,
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: 14,
              }}
            >
              Resume Consultation
            </button>
          </div>
        </div>
      )}

      {/* Camera consent modal */}
      {showConsentModal && (
        <ConsentBanner
          onConsent={(consented) => {
            setCameraConsented(consented);
            setShowConsentModal(false);
          }}
        />
      )}

      {/* Top Telemetry Strip: Real-time Clinical Vitals (BP, SpO2, HR, Temp) */}
      <LiveVitalsStrip
        utterances={finals.map((f) => f.segment?.text || "")}
        initialVitals={vitals}
        onVitalsChange={setVitals}
      />

      {/* Real-time CDS Drug-Drug & Allergy Warnings Banner */}
      <DdiAlertBanner
        interactions={cdsInteractions}
        allergies={cdsAllergies}
        onDismiss={() => {
          setCdsInteractions([]);
          setCdsAllergies([]);
        }}
      />

      {/* Real-time Emergency Warning Banner */}
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

      {/* Fall / Patient Collapse Video Alert */}
      {visionAlert && (
        <VisionAlertCard reason={visionAlert.reason} onAcknowledge={clearVisionAlert} />
      )}

      {/* Video Safety Monitor Panel (Camera Opt-In) */}
      {cameraConsented && mediaStream && (
        <VideoMonitorPanel
          stream={mediaStream}
          onDisable={() => setCameraConsented(false)}
          facePosition={facePosition}
        />
      )}

      {/* Main Console Centerpiece: Fluid Wave Visualizer & Live Audio Controls */}
      <div
        style={{
          background: isDark
            ? "radial-gradient(ellipse at 50% 30%, rgba(14, 165, 233, 0.12) 0%, rgba(15, 23, 42, 0.7) 75%)"
            : "radial-gradient(ellipse at 50% 30%, rgba(224, 242, 254, 0.7) 0%, rgba(255, 255, 255, 0.8) 75%)",
          border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(186, 230, 253, 0.8)"}`,
          borderRadius: 16,
          padding: 18,
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.35)" : "0 4px 20px rgba(14, 165, 233, 0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Calming Organic Wave Visualizer */}
        <WaveVisualizer
          level={level}
          active={isActive}
          speakerRole={latestFinal?.speaker ? roleFor(latestFinal.speaker.speaker_label) : undefined}
        />

        {/* Central Console Control Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            padding: "8px 12px",
            borderRadius: 12,
            background: isDark ? "rgba(30, 41, 59, 0.5)" : "rgba(241, 245, 249, 0.9)",
            border: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {!consentGiven ? (
              <button
                onClick={() => void start()}
                style={{
                  background: "linear-gradient(135deg, #0284c7 0%, #0d9488 100%)",
                  border: "none",
                  color: "#ffffff",
                  padding: "9px 22px",
                  borderRadius: 24,
                  fontSize: 13,
                  fontWeight: 700,
                  boxShadow: "0 2px 10px rgba(2, 132, 199, 0.3)",
                }}
              >
                Start consultation (I consent to audio recording)
              </button>
            ) : (
              <button
                onClick={handleStopConsultation}
                style={{
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  border: "none",
                  color: "#ffffff",
                  padding: "9px 22px",
                  borderRadius: 24,
                  fontSize: 13,
                  fontWeight: 700,
                  boxShadow: "0 2px 10px rgba(239, 68, 68, 0.3)",
                }}
              >
                Stop consultation
              </button>
            )}

            <WaveformMeter level={level} label="Microphone" active={isActive} />

            <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              {isActive ? "Recording" : consentGiven ? "Connecting…" : "Not recording"}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* HIPAA Safe Harbor De-identification Toggle */}
            <button
              onClick={() => setHipaaRedactionEnabled(!hipaaRedactionEnabled)}
              style={{
                fontSize: 12,
                padding: "5px 12px",
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
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 8,
                cursor: "pointer",
                background: "transparent",
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
              }}
            >
              📄 Export Record
            </button>

            {/* Official Prescription Slip */}
            <button
              onClick={() => setIsPrescriptionOpen(true)}
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 8,
                cursor: "pointer",
                background: isDark ? "rgba(14, 165, 233, 0.15)" : "rgba(2, 132, 199, 0.1)",
                border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.3)" : "#0284c7"}`,
                color: isDark ? "#38bdf8" : "#0284c7",
                fontWeight: 600,
              }}
              title="Open printable official clinical prescription (Rx) slip"
            >
              💊 Prescription (Rx)
            </button>

            {/* Camera Safety Monitoring Toggle (100% Opt-In) */}
            {!cameraConsented ? (
              <button
                onClick={() => setShowConsentModal(true)}
                style={{
                  fontSize: 12,
                  padding: "5px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  color: colors.textSecondary,
                }}
                title="Enable optional video safety monitoring for patient collapse or fall detection"
              >
                📷 Camera Safety (Opt-in)
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.success }}>
                <span>🟢 Camera Active</span>
                <button
                  onClick={() => setCameraConsented(false)}
                  style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer", borderRadius: 4 }}
                >
                  Disable
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" style={{ color: colors.danger, margin: "4px 0" }}>
            {error}
          </p>
        )}

        {dismissAlertError && (
          <p role="alert" style={{ color: colors.warning, fontSize: 12, margin: "4px 0" }}>
            {dismissAlertError}
          </p>
        )}

        {/* Live Subtitle & Transcript Deck */}
        <div
          style={{
            background: isDark ? "rgba(15, 23, 42, 0.85)" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.2)" : colors.border}`,
            borderRadius: 14,
            padding: 16,
            maxHeight: "360px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>💬</span>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textSecondary }}>
                Live Subtitles & Real-time Transcript
              </h3>
            </div>
            <span style={{ fontSize: 11, color: colors.textSecondary }}>
              {finals.length} utterance{finals.length === 1 ? "" : "s"}
            </span>
          </div>

          <ul
            aria-live="polite"
            aria-label="Transcript"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}
          >
            {finals.map((event) => (
              <li
                key={event.utterance_id}
                className="console-live-subtitle"
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: isDark ? "rgba(30, 41, 59, 0.5)" : "rgba(248, 250, 252, 0.9)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : colors.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "monospace" }}>
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
                  {event.risk && <RiskBadge level={event.risk.level} reason={event.risk.reason} />}
                </div>

                {event.emotion_error && (
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginBottom: 4 }}>
                    Tone assessment unavailable: {event.emotion_error}
                  </div>
                )}
                {event.risk_error && (
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginBottom: 4 }}>
                    Risk assessment unavailable: {event.risk_error}
                  </div>
                )}
                {event.emergency_error && (
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginBottom: 4 }}>
                    Emergency keyword check unavailable: {event.emergency_error}
                  </div>
                )}

                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.45 }}>
                  {event.segment && (
                    <HighlightedText
                      text={
                        hipaaRedactionEnabled
                          ? redactClientPHI(event.segment.text).redactedText
                          : event.segment.text
                      }
                      entities={event.entities}
                    />
                  )}
                </div>

                {event.entities_error && (
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginTop: 4 }}>
                    Medical term detection unavailable: {event.entities_error}
                  </div>
                )}

                {event.translation && (
                  <div
                    style={{
                      color: isDark ? "#38bdf8" : "#0369a1",
                      fontSize: 14,
                      marginTop: 6,
                      paddingLeft: 10,
                      borderLeft: `3px solid ${isDark ? "#38bdf8" : "#0284c7"}`,
                      lineHeight: 1.4,
                    }}
                  >
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
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginTop: 4 }}>
                    Medical term detection unavailable (translation): {event.translation_entities_error}
                  </div>
                )}
                {event.translation_error && (
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginTop: 4 }}>
                    Translation unavailable: {event.translation_error}
                  </div>
                )}

                {event.miscommunication && !event.miscommunication.consistent && (
                  <div style={{ marginTop: 6 }}>
                    <MiscommunicationAlert result={event.miscommunication} />
                  </div>
                )}
                {event.miscommunication_error && (
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginTop: 4 }}>
                    Miscommunication check unavailable: {event.miscommunication_error}
                  </div>
                )}

                {event.tts && (
                  <audio
                    controls
                    src={pcm16ToWavDataUrl(event.tts.audio_base64, event.tts.sample_rate)}
                    style={{ marginTop: 8, width: "100%", height: 32 }}
                  />
                )}
                {event.tts_error && (
                  <div role="alert" style={{ color: colors.warning, fontSize: 12, marginTop: 4 }}>
                    Audio playback unavailable: {event.tts_error}
                  </div>
                )}
              </li>
            ))}
            {latestPartial && (
              <li
                style={{
                  opacity: 0.7,
                  padding: "10px 12px",
                  fontStyle: "italic",
                  fontSize: 14,
                  background: isDark ? "rgba(30, 41, 59, 0.3)" : "rgba(241, 245, 249, 0.6)",
                  borderRadius: 8,
                }}
              >
                {latestPartial.segment?.text} …
              </li>
            )}
            {finals.length === 0 && !latestPartial && (
              <li style={{ color: colors.textSecondary, fontSize: 13, padding: "16px 0", textAlign: "center", fontStyle: "italic" }}>
                Awaiting consultation speech input… Click Start consultation to begin.
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Clinical Intelligence Panels Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
          marginTop: 4,
        }}
      >
        <SummaryPanel
          sessionId={sessionId}
          summary={memory?.draft_summary ?? null}
          approved={memory?.summary_approved ?? false}
          error={summaryError}
          isGenerating={isGeneratingSummary}
          onGenerate={() => void generateSummary()}
          onApprove={() => void approveSummary()}
          vitals={vitals}
        />

        <MedicalEntitiesPanel entities={allEntities} />

        <TimelineView sessionId={sessionId} events={memory?.timeline ?? []} />

        <AnalyticsDashboard finals={finals} />

        <ConversationMemoryPanel
          sessionId={sessionId}
          memory={memory}
          error={memoryError}
          removeCaseMemoryEntry={removeCaseMemoryEntry}
        />
      </div>

      {/* Export & Prescription Modals */}
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
