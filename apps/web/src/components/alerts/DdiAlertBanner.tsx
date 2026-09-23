import { useState } from "react";
import { useTheme } from "../../theme/ThemeProvider";

export interface DrugInteractionItem {
  drug_a: string;
  drug_b: string;
  severity: "CRITICAL" | "MAJOR" | "MODERATE" | "MINOR";
  mechanism: string;
  clinical_risk: string;
  recommendation: string;
}

export interface AllergyItem {
  allergen: string;
  medication: string;
  severity: "CRITICAL" | "MAJOR";
  reaction_risk: string;
  recommendation: string;
}

export interface DdiAlertBannerProps {
  interactions: DrugInteractionItem[];
  allergies: AllergyItem[];
  onDismiss?: () => void;
}

export function DdiAlertBanner({
  interactions,
  allergies,
  onDismiss,
}: DdiAlertBannerProps) {
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (interactions.length === 0 && allergies.length === 0)) {
    return null;
  }

  const hasCritical =
    allergies.length > 0 ||
    interactions.some((i) => i.severity === "CRITICAL");

  const borderColor = hasCritical ? colors.danger : "#f59e0b";
  const bgColor = hasCritical ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)";

  return (
    <div
      role="alert"
      aria-label="Clinical Decision Support safety alert"
      style={{
        margin: "12px 0",
        padding: "12px 16px",
        borderRadius: 8,
        border: `2px solid ${borderColor}`,
        background: bgColor,
        color: colors.textPrimary,
        boxShadow: hasCritical ? "0 0 12px rgba(239, 68, 68, 0.2)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{hasCritical ? "⚠️🚨" : "⚠️"}</span>
          <strong style={{ color: hasCritical ? colors.danger : "#d97706", fontSize: 15 }}>
            Clinical Safety Alert (DDI & Allergy Protection)
          </strong>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          style={{
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 12,
            cursor: "pointer",
            color: colors.textSecondary,
          }}
          aria-label="Dismiss clinical alert"
        >
          Dismiss
        </button>
      </div>

      {/* Allergies list */}
      {allergies.map((a, idx) => (
        <div
          key={`allergy-${idx}`}
          style={{
            marginTop: 10,
            padding: 8,
            background: colors.surface,
            borderRadius: 6,
            borderLeft: `4px solid ${colors.danger}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                background: colors.danger,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              ALLERGY CONTRAINDICATION
            </span>
            <strong>
              {a.allergen} Allergy ✕ {a.medication}
            </strong>
          </div>
          <div style={{ fontSize: 13, marginBottom: 2 }}>
            <strong>Risk:</strong> {a.reaction_risk}
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>
            <strong>Action:</strong> {a.recommendation}
          </div>
        </div>
      ))}

      {/* Interactions list */}
      {interactions.map((i, idx) => (
        <div
          key={`ddi-${idx}`}
          style={{
            marginTop: 10,
            padding: 8,
            background: colors.surface,
            borderRadius: 6,
            borderLeft: `4px solid ${i.severity === "CRITICAL" ? colors.danger : "#f59e0b"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                background: i.severity === "CRITICAL" ? colors.danger : "#f59e0b",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {i.severity} DDI
            </span>
            <strong>
              {i.drug_a} + {i.drug_b}
            </strong>
          </div>
          <div style={{ fontSize: 13, marginBottom: 2 }}>
            <strong>Mechanism:</strong> {i.mechanism}
          </div>
          <div style={{ fontSize: 13, marginBottom: 2 }}>
            <strong>Clinical Risk:</strong> {i.clinical_risk}
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>
            <strong>Mitigation:</strong> {i.recommendation}
          </div>
        </div>
      ))}
    </div>
  );
}
