import type { VitalsData } from "./LiveVitalsStrip";
import type { StructuredSummary, SummaryBullet } from "../../hooks/useConversationMemory";

export interface PrescriptionSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: StructuredSummary | null;
  vitals?: VitalsData;
  sessionId?: string | null;
}

export function PrescriptionSlipModal({
  isOpen,
  onClose,
  summary,
  vitals,
  sessionId,
}: PrescriptionSlipModalProps) {
  if (!isOpen) return null;

  const now = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const medications: SummaryBullet[] = (summary?.medications as SummaryBullet[]) || [];
  const recommendations: SummaryBullet[] = (summary?.recommendations as SummaryBullet[]) || [];
  const followUp: SummaryBullet[] = (summary?.follow_up as SummaryBullet[]) || [];
  const complaints: SummaryBullet[] = (summary?.complaints as SummaryBullet[]) || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clinical Prescription Slip"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="prescription-slip"
        style={{
          background: "#ffffff",
          color: "#1e293b",
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 12,
          padding: "32px 36px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
          fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          position: "relative",
        }}
      >
        {/* Actions header (Hidden in print) */}
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            paddingBottom: 12,
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
            Official Medical Prescription (Rx)
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => window.print()}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "6px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              🖨️ Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              style={{
                background: "#f1f5f9",
                color: "#475569",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Prescription Header */}
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #0284c7", paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: "#0369a1", fontWeight: 800 }}>
              MediBridge Telehealth Clinic
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
              Smart Bilingual Telemedicine & AI-Assisted Clinical Workstation
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>
              Session Ref: {sessionId ? `${sessionId.slice(0, 8)}...` : "CONS-TELEHEALTH-101"}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: "bold", color: "#0284c7", lineHeight: 1 }}>
              ℞
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Date: {now}</div>
          </div>
        </div>

        {/* Patient Vitals Block */}
        {vitals && (vitals.bpSystolic || vitals.spo2 || vitals.heartRate || vitals.temperature) && (
          <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: 8, marginBottom: 20, border: "1px solid #e2e8f0" }}>
            <strong style={{ fontSize: 12, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Recorded Vital Signs:
            </strong>
            <div style={{ display: "flex", gap: 20, marginTop: 4, fontSize: 13 }}>
              {vitals.bpSystolic && vitals.bpDiastolic && (
                <span><strong>BP:</strong> {vitals.bpSystolic}/{vitals.bpDiastolic} mmHg</span>
              )}
              {vitals.spo2 && (
                <span><strong>SpO2:</strong> {vitals.spo2}%</span>
              )}
              {vitals.heartRate && (
                <span><strong>Pulse:</strong> {vitals.heartRate} bpm</span>
              )}
              {vitals.temperature && (
                <span><strong>Temp:</strong> {vitals.temperature}°F</span>
              )}
            </div>
          </div>
        )}

        {/* Chief Complaints */}
        {complaints.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14, color: "#0f172a", textTransform: "uppercase" }}>
              Chief Complaints
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#334155" }}>
              {complaints.map((c, idx) => (
                <li key={idx} style={{ marginBottom: 2 }}>{c.text}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Prescribed Medications (Rx Table) */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#0f172a", textTransform: "uppercase" }}>
            Prescribed Medications (दवाइयां)
          </h3>
          {medications.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", fontStyle: "italic" }}>
              No medications recorded in consultation note.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", borderBottom: "1px solid #cbd5e1" }}>#</th>
                  <th style={{ padding: "8px 12px", borderBottom: "1px solid #cbd5e1" }}>Medication & Dosage</th>
                  <th style={{ padding: "8px 12px", borderBottom: "1px solid #cbd5e1" }}>Instructions</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((m, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "8px 12px", fontWeight: "bold", color: "#64748b" }}>{idx + 1}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#0f172a" }}>{m.text}</td>
                    <td style={{ padding: "8px 12px", color: "#475569" }}>As directed by physician</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recommendations & Follow-up */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14, color: "#0f172a", textTransform: "uppercase" }}>
            Clinical Advice & Follow-Up (सलाह एवं परहेज)
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#334155" }}>
            {recommendations.map((r, idx) => (
              <li key={idx} style={{ marginBottom: 3 }}>{r.text}</li>
            ))}
            {followUp.map((f, idx) => (
              <li key={`fu-${idx}`} style={{ marginBottom: 3, fontWeight: 600, color: "#0369a1" }}>
                Follow-up: {f.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Doctor Signature Block & Disclaimer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 40, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", maxWidth: 380, lineHeight: 1.4 }}>
            * This digital prescription was generated during a HIPAA-compliant MediBridge AI consultation session. For emergencies, please call 112 / 108 or proceed to the nearest hospital emergency department immediately.
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 140, borderBottom: "1px solid #0f172a", marginBottom: 6 }} />
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#0f172a" }}>Attending Physician</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>Verified Digital Stamp</div>
          </div>
        </div>
      </div>
    </div>
  );
}
