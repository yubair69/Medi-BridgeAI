import { ThemeProvider, useTheme } from "./theme/ThemeProvider";
import { HealthStatus } from "./components/shared/HealthStatus";
import { LiveTranscriptPanel } from "./components/panels/LiveTranscriptPanel";

/**
 * Full-Screen Clinical Console Shell (MediBridge Cockpit Environment)
 * Fluid, calming, high-contrast interface designed for zero-scroll consultation ergonomics.
 */
function Shell() {
  const { colors, mode, toggle } = useTheme();
  const isDark = mode === "dark";

  return (
    <div
      style={{
        background: isDark
          ? "radial-gradient(ellipse at 50% 0%, #0c1a2e 0%, #070d18 100%)"
          : "radial-gradient(ellipse at 50% 0%, #f0f9ff 0%, #e2e8f0 100%)",
        color: colors.textPrimary,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Console Top Navigation Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 28px",
          background: isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${isDark ? "rgba(56, 189, 248, 0.2)" : colors.border}`,
          boxShadow: isDark
            ? "0 4px 20px rgba(0, 0, 0, 0.4)"
            : "0 2px 10px rgba(15, 27, 45, 0.05)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              background: isDark
                ? "linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)"
                : "linear-gradient(135deg, rgba(2, 132, 199, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)",
              border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.3)" : "#bae6fd"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            <span aria-hidden="true">🩺</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
                MediBridge AI
              </h1>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.12)",
                  color: colors.success,
                  border: `1px solid ${colors.success}`,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Clinical Console
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: colors.textSecondary }}>
              Real-time Hindi ↔ English medical consultation assistant
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={toggle}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 8,
              background: isDark ? "rgba(30, 41, 59, 0.8)" : "#ffffff",
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{mode === "light" ? "🌙" : "☀️"}</span>
            <span>Switch to {mode === "light" ? "dark" : "light"} mode</span>
          </button>
        </div>
      </header>

      {/* Blueprint Section 11.4 — Persistent Regulatory & Clinical Disclaimer HUD */}
      <div
        role="alert"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: isDark ? "rgba(245, 158, 11, 0.15)" : colors.warning,
          color: isDark ? "#fbbf24" : "#ffffff",
          borderBottom: isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "none",
          padding: "7px 20px",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.01em",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 14 }}>⚠️</span>
        <span>
          MediBridge AI assists communication. It does not diagnose. Always confirm critical
          information verbally.
        </span>
      </div>

      {/* Main Console HUD Workspace */}
      <main
        style={{
          display: "grid",
          gridTemplateColumns: "270px 1fr",
          gap: 20,
          padding: "20px 24px",
          maxWidth: 1680,
          width: "100%",
          margin: "0 auto",
          alignItems: "start",
          flex: 1,
        }}
      >
        {/* Left Telemetry Sidebar */}
        <aside
          aria-label="Session status"
          style={{
            background: isDark ? "rgba(15, 23, 42, 0.75)" : colors.surface,
            backdropFilter: "blur(12px)",
            border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.2)" : colors.border}`,
            borderRadius: 14,
            padding: 16,
            boxShadow: isDark ? "0 8px 30px rgba(0,0,0,0.3)" : "0 4px 16px rgba(15, 27, 45, 0.04)",
            position: "sticky",
            top: 76,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <h2 style={{ fontSize: 14, margin: 0, fontWeight: 700 }}>System Status</h2>
          </div>
          <HealthStatus />
        </aside>

        {/* Center Clinical Console Stage */}
        <section
          aria-label="Consultation"
          style={{
            background: isDark ? "rgba(15, 23, 42, 0.65)" : colors.surface,
            backdropFilter: "blur(12px)",
            border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.2)" : colors.border}`,
            borderRadius: 16,
            padding: 20,
            boxShadow: isDark ? "0 10px 40px rgba(0,0,0,0.35)" : "0 4px 20px rgba(15, 27, 45, 0.04)",
            minWidth: 0,
          }}
        >
          <LiveTranscriptPanel />
        </section>
      </main>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
