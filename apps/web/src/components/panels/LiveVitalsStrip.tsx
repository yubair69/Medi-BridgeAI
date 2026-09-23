import { useEffect, useState } from "react";
import { useTheme } from "../../theme/ThemeProvider";

export interface VitalsData {
  bpSystolic?: number;
  bpDiastolic?: number;
  spo2?: number;
  heartRate?: number;
  temperature?: number;
}

export interface LiveVitalsStripProps {
  utterances: string[];
  initialVitals?: VitalsData;
  onVitalsChange?: (vitals: VitalsData) => void;
}

const BP_REGEX = /\b(?:bp|blood\s*pressure)?\s*(?:is\s*)?(\d{2,3})\s*(?:[\s/]|over)\s*(\d{2,3})\s*(?:mm\s*hg)?\b/i;
const SPO2_REGEX = /\b(?:spo2|oxygen|o2|sat(?:uration)?)\s*(?:is|if|of|:|at)?\s*(\d{2,3})\s*%?\b/i;
const HR_REGEX = /(?:\b(?:pulse(?:\s*rate)?|heart\s*rate|hr)\s*(?:is|if|of|:|at)?\s*(\d{2,3})|\b(\d{2,3})\s*(?:bpm|beats\s*(?:per\s*min(?:ute)?|\/min)?))\b/i;
const TEMP_REGEX = /\b(?:temp(?:erature)?|fever)?\s*(?:is|at|of)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:deg(?:rees)?\s*(?:fahrenheit|celsius|f|c)?|[°\s]?[fc]|fahrenheit|celsius)\b/i;


export function extractVitalsFromSpeech(utterances: string[]): VitalsData {
  const result: VitalsData = {};
  for (const u of utterances) {
    const bp = BP_REGEX.exec(u);
    if (bp && !result.bpSystolic) {
      result.bpSystolic = Number(bp[1]);
      result.bpDiastolic = Number(bp[2]);
    }
    const spo2 = SPO2_REGEX.exec(u);
    if (spo2 && !result.spo2) {
      result.spo2 = Number(spo2[1]);
    }
    const hr = HR_REGEX.exec(u);
    if (hr && !result.heartRate) {
      result.heartRate = Number(hr[1] || hr[2]);
    }
    const temp = TEMP_REGEX.exec(u);
    if (temp && temp[1] && !result.temperature) {
      result.temperature = parseFloat(temp[1]);
    }
  }
  return result;
}

export function LiveVitalsStrip({
  utterances,
  initialVitals,
  onVitalsChange,
}: LiveVitalsStripProps) {
  const { colors } = useTheme();
  const [vitals, setVitals] = useState<VitalsData>(initialVitals || {});
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const extracted = extractVitalsFromSpeech(utterances);
    if (
      extracted.bpSystolic ||
      extracted.spo2 ||
      extracted.heartRate ||
      extracted.temperature
    ) {
      setVitals((prev) => {
        const next = { ...prev, ...extracted };
        onVitalsChange?.(next);
        return next;
      });
    }
  }, [utterances, onVitalsChange]);

  const hasAnyVitals =
    vitals.bpSystolic != null ||
    vitals.spo2 != null ||
    vitals.heartRate != null ||
    vitals.temperature != null;

  // BP Triage
  let bpBadge = { label: "Normal", color: colors.success };
  if (vitals.bpSystolic && vitals.bpDiastolic) {
    if (vitals.bpSystolic > 180 || vitals.bpDiastolic > 120) {
      bpBadge = { label: "CRISIS", color: colors.danger };
    } else if (vitals.bpSystolic >= 140 || vitals.bpDiastolic >= 90) {
      bpBadge = { label: "Stage 2 HTN", color: colors.danger };
    } else if (vitals.bpSystolic >= 130 || vitals.bpDiastolic >= 80) {
      bpBadge = { label: "Stage 1 HTN", color: "#f59e0b" };
    } else if (vitals.bpSystolic >= 120 && vitals.bpDiastolic < 80) {
      bpBadge = { label: "Elevated", color: "#eab308" };
    } else if (vitals.bpSystolic < 90 || vitals.bpDiastolic < 60) {
      bpBadge = { label: "Hypotension", color: "#3b82f6" };
    }
  }

  // SpO2 Triage
  let spo2Badge = { label: "Normal", color: colors.success };
  if (vitals.spo2) {
    if (vitals.spo2 < 90) {
      spo2Badge = { label: "Severe Hypoxia", color: colors.danger };
    } else if (vitals.spo2 < 95) {
      spo2Badge = { label: "Mild Hypoxia", color: "#f59e0b" };
    }
  }

  // HR Triage
  let hrBadge = { label: "Normal", color: colors.success };
  if (vitals.heartRate) {
    if (vitals.heartRate > 120) {
      hrBadge = { label: "Severe Tachy", color: colors.danger };
    } else if (vitals.heartRate > 100) {
      hrBadge = { label: "Tachycardia", color: "#f59e0b" };
    } else if (vitals.heartRate < 60) {
      hrBadge = { label: "Bradycardia", color: "#3b82f6" };
    }
  }

  // Temp Triage
  let tempBadge = { label: "Normal", color: colors.success };
  if (vitals.temperature) {
    if (vitals.temperature >= 101) {
      tempBadge = { label: "High Fever", color: colors.danger };
    } else if (vitals.temperature > 99.1) {
      tempBadge = { label: "Low-grade Fever", color: "#f59e0b" };
    } else if (vitals.temperature < 96) {
      tempBadge = { label: "Hypothermia", color: "#3b82f6" };
    }
  }

  return (
    <div
      role="region"
      aria-label="Patient vital signs telemetry"
      style={{
        margin: "10px 0",
        padding: "10px 14px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>💓</span>
          <strong style={{ fontSize: 13, letterSpacing: 0.5 }}>
            REAL-TIME CLINICAL VITALS TELEMETRY
          </strong>
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            (Live audio speech extraction)
          </span>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
            border: `1px solid ${colors.border}`,
            background: "transparent",
            cursor: "pointer",
            color: colors.textSecondary,
          }}
        >
          {isEditing ? "Done" : "Manual Edit"}
        </button>
      </div>

      {!hasAnyVitals && !isEditing ? (
        <div style={{ fontSize: 12, color: colors.textSecondary, fontStyle: "italic" }}>
          Listening for spoken vitals (e.g. &quot;BP 130/85&quot;, &quot;SpO2 96%&quot;, &quot;Pulse 78&quot;, &quot;Temp 101 F&quot;)...
        </div>
      ) : isEditing ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
          <label>
            BP Sys:
            <input
              type="number"
              value={vitals.bpSystolic || ""}
              onChange={(e) =>
                setVitals({ ...vitals, bpSystolic: Number(e.target.value) || undefined })
              }
              style={{ width: 50, marginLeft: 4 }}
            />
          </label>
          <label>
            BP Dia:
            <input
              type="number"
              value={vitals.bpDiastolic || ""}
              onChange={(e) =>
                setVitals({ ...vitals, bpDiastolic: Number(e.target.value) || undefined })
              }
              style={{ width: 50, marginLeft: 4 }}
            />
          </label>
          <label>
            SpO2 (%):
            <input
              type="number"
              value={vitals.spo2 || ""}
              onChange={(e) =>
                setVitals({ ...vitals, spo2: Number(e.target.value) || undefined })
              }
              style={{ width: 50, marginLeft: 4 }}
            />
          </label>
          <label>
            Heart Rate:
            <input
              type="number"
              value={vitals.heartRate || ""}
              onChange={(e) =>
                setVitals({ ...vitals, heartRate: Number(e.target.value) || undefined })
              }
              style={{ width: 50, marginLeft: 4 }}
            />
          </label>
          <label>
            Temp (°F):
            <input
              type="number"
              step="0.1"
              value={vitals.temperature || ""}
              onChange={(e) =>
                setVitals({ ...vitals, temperature: parseFloat(e.target.value) || undefined })
              }
              style={{ width: 50, marginLeft: 4 }}
            />
          </label>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {/* BP */}
          {vitals.bpSystolic && vitals.bpDiastolic && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>BP:</span>
              <span style={{ fontSize: 14, fontWeight: "bold" }}>
                {vitals.bpSystolic}/{vitals.bpDiastolic} <small style={{ fontSize: 10 }}>mmHg</small>
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: `${bpBadge.color}22`,
                  color: bpBadge.color,
                  fontWeight: 700,
                  border: `1px solid ${bpBadge.color}`,
                }}
              >
                {bpBadge.label}
              </span>
            </div>
          )}

          {/* SpO2 */}
          {vitals.spo2 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>SpO2:</span>
              <span style={{ fontSize: 14, fontWeight: "bold" }}>
                {vitals.spo2}%
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: `${spo2Badge.color}22`,
                  color: spo2Badge.color,
                  fontWeight: 700,
                  border: `1px solid ${spo2Badge.color}`,
                }}
              >
                {spo2Badge.label}
              </span>
            </div>
          )}

          {/* Pulse */}
          {vitals.heartRate && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Pulse:</span>
              <span style={{ fontSize: 14, fontWeight: "bold" }}>
                {vitals.heartRate} <small style={{ fontSize: 10 }}>bpm</small>
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: `${hrBadge.color}22`,
                  color: hrBadge.color,
                  fontWeight: 700,
                  border: `1px solid ${hrBadge.color}`,
                }}
              >
                {hrBadge.label}
              </span>
            </div>
          )}

          {/* Temperature */}
          {vitals.temperature && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Temp:</span>
              <span style={{ fontSize: 14, fontWeight: "bold" }}>
                {vitals.temperature}°F
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: `${tempBadge.color}22`,
                  color: tempBadge.color,
                  fontWeight: 700,
                  border: `1px solid ${tempBadge.color}`,
                }}
              >
                {tempBadge.label}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
