import { useState } from "react";
import type { StructuredSummary, SummaryBullet } from "../../hooks/useConversationMemory";
import type { VitalsData } from "./LiveVitalsStrip";
import { useTheme } from "../../theme/ThemeProvider";
import { GATEWAY_HTTP_URL } from "../../config";
import { pcm16ToWavDataUrl } from "../../audio/wav";

export interface SummaryPanelProps {
  sessionId: string | null;
  summary: StructuredSummary | null;
  approved: boolean;
  error: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  vitals?: VitalsData;
}

const SECTION_LABELS: Record<keyof Pick<
  StructuredSummary,
  | "complaints"
  | "symptoms"
  | "objective"
  | "diagnoses_mentioned"
  | "medications"
  | "recommendations"
  | "action_items"
  | "follow_up"
>, string> = {
  complaints: "Complaints",
  symptoms: "Symptoms",
  objective: "Objective",
  diagnoses_mentioned: "Diagnoses Mentioned",
  medications: "Medications",
  recommendations: "Recommendations",
  action_items: "Action Items",
  follow_up: "Follow-up",
};

const SECTION_ICONS: Record<string, string> = {
  complaints: "🩺",
  symptoms: "🌡️",
  objective: "🔍",
  diagnoses_mentioned: "📋",
  medications: "💊",
  recommendations: "💡",
  action_items: "✅",
  follow_up: "📅",
};

const SECTION_KEYS = Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[];

/** AI Consultation Summary (Blueprint Section 2.4: "draft, clinician must
 * review/approve before export -- never auto-finalized"). Always labeled
 * AI-generated (Blueprint Section 3.3 Principle) -- the DRAFT banner is
 * never removed just because content exists, only once the clinician
 * explicitly approves. Every bullet cites its source utterance id
 * (Blueprint Section 11.1 grounding), and discarded_ungrounded_count is
 * shown, not hidden -- transparency about what the model proposed but
 * couldn't be verified. */
export function SummaryPanel({
  sessionId,
  summary,
  approved,
  error,
  isGenerating,
  onGenerate,
  onApprove,
  vitals,
}: SummaryPanelProps) {
  const { colors, mode } = useTheme();
  const [patientAudioUrl, setPatientAudioUrl] = useState<string | null>(null);
  const [patientScript, setPatientScript] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const isDark = mode === "dark";

  const handleGeneratePatientAudio = async () => {
    if (!summary) return;
    setIsLoadingAudio(true);
    setAudioError(null);
    try {
      const res = await fetch(`${GATEWAY_HTTP_URL}/tts/patient-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medications: summary.medications.map((m) => m.text),
          recommendations: summary.recommendations.map((r) => r.text),
          follow_up: summary.follow_up[0]?.text || null,
          language: "hi",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const wavUrl = pcm16ToWavDataUrl(data.audio_base64, data.sample_rate);
      setPatientAudioUrl(wavUrl);
      setPatientScript(data.spoken_script);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingAudio(false);
    }
  };

  if (!sessionId) {
    return (
      <section aria-label="AI consultation summary">
        <h2 style={{ fontSize: 14 }}>AI Consultation Summary</h2>
        <p style={{ color: colors.textSecondary, fontSize: 12 }}>Not tracking -- no active session.</p>
      </section>
    );
  }

  const hasVitals = vitals && (vitals.bpSystolic || vitals.spo2 || vitals.heartRate || vitals.temperature);

  return (
    <section
      aria-label="AI consultation summary"
      style={{
        background: isDark ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
        border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.2)" : colors.border}`,
        borderRadius: "14px",
        padding: "18px",
        boxShadow: isDark ? "0 8px 30px rgba(0,0,0,0.3)" : "0 4px 16px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>AI Consultation Summary</h2>
        </div>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            padding: "6px 14px",
            borderRadius: 8,
          }}
        >
          {isGenerating ? "Generating…" : summary ? "Regenerate summary" : "Generate summary"}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: colors.warning, fontSize: 12, margin: "8px 0" }}>
          Summary unavailable: {error}
        </p>
      )}

      {summary && (
        <div
          style={{
            border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.25)" : colors.border}`,
            borderRadius: 10,
            padding: 16,
            marginTop: 10,
            background: isDark ? "rgba(30, 41, 59, 0.5)" : "rgba(248, 250, 252, 0.8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: approved ? colors.success : "#f59e0b",
                border: `1px solid ${approved ? colors.success : "#f59e0b"}`,
                background: approved ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                borderRadius: 6,
                padding: "3px 10px",
              }}
            >
              {approved ? "APPROVED" : "DRAFT — AI-generated, not yet reviewed"}
            </span>

            {!approved && (
              <button
                onClick={onApprove}
                style={{
                  background: colors.success,
                  borderColor: colors.success,
                  color: "#fff",
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 6,
                }}
              >
                Approve summary
              </button>
            )}
          </div>

          {summary.patient_info && (
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 12px", color: colors.textPrimary }}>
              {summary.patient_info}
            </p>
          )}

          {/* Vitals Telemetry overview within Summary */}
          {hasVitals && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: isDark ? "rgba(14, 165, 233, 0.08)" : "rgba(224, 242, 254, 0.5)",
                border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.2)" : "#bae6fd"}`,
              }}
            >
              <h4 style={{ margin: "0 0 6px", fontSize: 12, color: isDark ? "#38bdf8" : "#0284c7" }}>
                💓 Documented Vital Signs Telemetry
              </h4>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
                {vitals.bpSystolic && vitals.bpDiastolic && (
                  <span><strong>BP:</strong> {vitals.bpSystolic}/{vitals.bpDiastolic} mmHg</span>
                )}
                {vitals.spo2 && <span><strong>SpO2:</strong> {vitals.spo2}%</span>}
                {vitals.heartRate && <span><strong>Pulse:</strong> {vitals.heartRate} bpm</span>}
                {vitals.temperature && <span><strong>Temp:</strong> {vitals.temperature}°F</span>}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {SECTION_KEYS.map((key) => {
              const bullets = summary[key] as SummaryBullet[];
              if (bullets.length === 0) return null;
              const isMed = key === "medications";
              return (
                <div
                  key={key}
                  style={{
                    background: isDark ? "rgba(15, 23, 42, 0.5)" : "#ffffff",
                    border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.08)" : colors.border}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: 12,
                      margin: "0 0 6px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: isMed ? colors.primary : colors.textPrimary,
                    }}
                  >
                    <span>{SECTION_ICONS[key] || "•"}</span>
                    <span>{SECTION_LABELS[key]}</span>
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
                    {bullets.map((bullet, index) => (
                      <li key={index} title={`Source: utterance ${bullet.source_utterance_id}`}>
                        {bullet.text}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {summary.discarded_ungrounded_count > 0 && (
            <p style={{ color: colors.textSecondary, fontSize: 11, marginTop: 12 }}>
              {summary.discarded_ungrounded_count} proposed item
              {summary.discarded_ungrounded_count === 1 ? "" : "s"} could not be grounded in the transcript and{" "}
              {summary.discarded_ungrounded_count === 1 ? "was" : "were"} discarded.
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 11, color: colors.textSecondary }}>
            <span>Model: {summary.model_name}</span>
          </div>

          {/* Spoken Hindi Patient Care & Medication Instructions (MMS-TTS) */}
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${isDark ? "rgba(255, 255, 255, 0.08)" : colors.border}`,
            }}
          >
            <button
              onClick={handleGeneratePatientAudio}
              disabled={isLoadingAudio}
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                border: `1px solid ${colors.success}`,
                color: colors.success,
                borderRadius: 6,
                padding: "8px 14px",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>🎧</span>
              <span>
                {isLoadingAudio
                  ? "ऑडियो तैयार हो रहा है…"
                  : "मरीज़ के लिए आवाज़ में निर्देश (Listen Hindi Audio Discharge)"}
              </span>
            </button>

            {audioError && (
              <p style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>
                Audio failed: {audioError}
              </p>
            )}

            {patientAudioUrl && (
              <div style={{ marginTop: 10 }}>
                <audio controls src={patientAudioUrl} style={{ width: "100%", height: 36 }} />
                {patientScript && (
                  <p
                    style={{
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    &quot;{patientScript}&quot;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
