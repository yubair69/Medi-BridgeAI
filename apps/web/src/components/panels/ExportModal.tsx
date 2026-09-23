import { useState } from "react";
import { useTheme } from "../../theme/ThemeProvider";
import { redactClientPHI } from "../../utils/hipaaRedactor";
import type { TranscriptEvent, MedicalEntity } from "@medibridge/shared-types";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  events: TranscriptEvent[];
  entities: MedicalEntity[];
  summary: any | null;
}

export function ExportModal({
  isOpen,
  onClose,
  sessionId,
  events,
  entities,
  summary,
}: ExportModalProps) {
  const { colors } = useTheme();
  const [format, setFormat] = useState<"txt" | "json" | "print">("txt");
  const [deidentify, setDeidentify] = useState(true);

  if (!isOpen) return null;

  const finals = events.filter((e) => e.type === "final" && e.segment);

  const getExportText = () => {
    let lines: string[] = [
      "==================================================",
      "             MEDIBRIDGE AI CLINICAL RECORD         ",
      "==================================================",
      `Session ID: ${sessionId ?? "N/A"}`,
      `Date/Time : ${new Date().toISOString()}`,
      `De-identified (HIPAA Safe Harbor 18): ${deidentify ? "YES" : "NO"}`,
      "--------------------------------------------------",
      "",
      "--- CLINICAL SUMMARY (SOAP) ---",
    ];

    if (summary) {
      if (summary.patient_info) lines.push(`Patient: ${summary.patient_info}`);
      if (summary.complaints?.length) {
        lines.push("\n[Chief Complaints]");
        summary.complaints.forEach((b: any) => lines.push(` • ${b.text}`));
      }
      if (summary.symptoms?.length) {
        lines.push("\n[Symptoms]");
        summary.symptoms.forEach((b: any) => lines.push(` • ${b.text}`));
      }
      if (summary.objective?.length) {
        lines.push("\n[Objective / Vitals]");
        summary.objective.forEach((b: any) => lines.push(` • ${b.text}`));
      }
      if (summary.medications?.length) {
        lines.push("\n[Medications]");
        summary.medications.forEach((b: any) => lines.push(` • ${b.text}`));
      }
      if (summary.recommendations?.length) {
        lines.push("\n[Recommendations]");
        summary.recommendations.forEach((b: any) => lines.push(` • ${b.text}`));
      }
      if (summary.follow_up?.length) {
        lines.push("\n[Follow-up]");
        summary.follow_up.forEach((b: any) => lines.push(` • ${b.text}`));
      }
    } else {
      lines.push("No summary generated yet.");
    }

    lines.push("\n--------------------------------------------------");
    lines.push("--- BILINGUAL TRANSCRIPT ---");
    finals.forEach((e) => {
      const spk = e.speaker?.speaker_label ?? "Unassigned";
      const orig = e.segment?.text ?? "";
      const trans = e.translation?.text ? ` (Translated: ${e.translation.text})` : "";
      lines.push(`[${spk}] ${orig}${trans}`);
    });

    lines.push("\n--------------------------------------------------");
    lines.push("DISCLAIMER: MediBridge AI assists clinical communication.");
    lines.push("It does not diagnose. Verified by attending clinician.");
    lines.push("==================================================");

    const fullDoc = lines.join("\n");
    return deidentify ? redactClientPHI(fullDoc).redactedText : fullDoc;
  };

  const handleDownload = () => {
    if (format === "print") {
      const text = getExportText();
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`<pre style="font-family: monospace; white-space: pre-wrap; padding: 24px;">${text}</pre>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
      return;
    }

    let content = "";
    let mimeType = "text/plain";
    let ext = "txt";

    if (format === "txt") {
      content = getExportText();
    } else if (format === "json") {
      mimeType = "application/json";
      ext = "json";
      const record = {
        session_id: sessionId,
        exported_at: new Date().toISOString(),
        deidentified: deidentify,
        summary,
        entities,
        transcript: finals.map((f) => ({
          utterance_id: f.utterance_id,
          speaker: f.speaker?.speaker_label,
          original: deidentify && f.segment ? redactClientPHI(f.segment.text).redactedText : f.segment?.text,
          translation: deidentify && f.translation ? redactClientPHI(f.translation.text).redactedText : f.translation?.text,
        })),
        disclaimer: "MediBridge AI assists clinical communication. It does not diagnose.",
      };
      content = JSON.stringify(record, null, 2);
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medibridge-consultation-${sessionId ?? "record"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="Export consultation record"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 150,
      }}
    >
      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 480,
          width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Export Consultation Record</h2>
        <p style={{ color: colors.textSecondary, fontSize: 14 }}>
          Export the consultation notes, bilingual transcript, and clinical summary.
        </p>

        <div style={{ margin: "16px 0" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>
            Format:
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="export-format"
                value="txt"
                checked={format === "txt"}
                onChange={() => setFormat("txt")}
              />
              EHR Clinical Note (.txt)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="export-format"
                value="json"
                checked={format === "json"}
                onChange={() => setFormat("json")}
              />
              FHIR / JSON (.json)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="export-format"
                value="print"
                checked={format === "print"}
                onChange={() => setFormat("print")}
              />
              Printable / PDF
            </label>
          </div>
        </div>

        <div style={{ margin: "16px 0", background: "rgba(59, 130, 246, 0.08)", padding: 12, borderRadius: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 500, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={deidentify}
              onChange={(e) => setDeidentify(e.target.checked)}
            />
            <span>Apply HIPAA Safe Harbor 18 PHI De-identification (Names, MRNs, dates, phones, Aadhaar redacted)</span>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={handleDownload}
            style={{
              background: colors.primary,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontWeight: 500,
            }}
          >
            {format === "print" ? "Print / Save PDF" : "Download Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
