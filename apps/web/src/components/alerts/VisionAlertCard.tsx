import { useState } from "react";
import { useTheme } from "../../theme/ThemeProvider";

export interface VisionAlertCardProps {
  reason: string;
  onAcknowledge: () => void;
}

/** Non-dismissible vision safety alert (Blueprint §8: "in-app emergency
 * notification"). Requires explicit acknowledgment, not just a close click,
 * to remind the clinician to check on the patient before clearing. */
export function VisionAlertCard({ reason, onAcknowledge }: VisionAlertCardProps) {
  const { colors } = useTheme();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div
      role="alertdialog"
      aria-label="Vision safety alert"
      style={{
        border: `2px solid ${colors.warning}`,
        background: colors.surface,
        color: colors.textPrimary,
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>📷</span>
        <strong style={{ color: colors.warning }}>Camera safety alert</strong>
      </div>
      <p style={{ margin: 0 }}>{reason}</p>
      <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>
        This is an automated visual detection, not a confirmed medical event. Verify the
        patient's status directly.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          aria-label="I have checked on the patient"
        />
        I have verified the patient&apos;s status
      </label>
      <button
        onClick={onAcknowledge}
        disabled={!confirmed}
        aria-disabled={!confirmed}
      >
        Acknowledge
      </button>
    </div>
  );
}
