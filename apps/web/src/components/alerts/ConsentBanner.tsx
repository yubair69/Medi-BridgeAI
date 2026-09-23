import { useState } from "react";
import { useTheme } from "../../theme/ThemeProvider";

export interface ConsentBannerProps {
  onConsent: (consented: boolean) => void;
}

/** One-time per-session camera consent modal (Blueprint §8 Phase 8:
 * "consent flow ... in-app only by default"). Camera is optional;
 * declining still allows the full audio pipeline. */
export function ConsentBanner({ onConsent }: ConsentBannerProps) {
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleChoice = (consented: boolean) => {
    setDismissed(true);
    onConsent(consented);
  };

  return (
    <div
      role="dialog"
      aria-label="Camera consent"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          padding: 28,
          maxWidth: 420,
          width: "90%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Enable camera safety monitoring?</h2>
        <p style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
          MediBridge AI can optionally monitor the camera feed to detect if a patient
          collapses, becomes motionless, or leaves the frame. An in-app alert will be
          shown if a concern is detected — no data leaves your device beyond the detection
          result.
        </p>
        <p style={{ color: colors.textSecondary, fontSize: 13 }}>
          This is optional. Declining does not affect audio translation.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            onClick={() => handleChoice(false)}
            aria-label="Decline camera access"
          >
            No thanks
          </button>
          <button
            onClick={() => handleChoice(true)}
            aria-label="Enable camera safety monitoring"
            style={{ background: colors.primary, color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px" }}
          >
            Enable camera
          </button>
        </div>
      </div>
    </div>
  );
}
