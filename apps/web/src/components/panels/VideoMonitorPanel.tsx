import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../theme/ThemeProvider";

export interface VideoMonitorPanelProps {
  stream: MediaStream | null;
  onDisable: () => void;
}

export function VideoMonitorPanel({ stream, onDisable }: VideoMonitorPanelProps) {
  const { colors } = useTheme();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [blurFace, setBlurFace] = useState(true);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div
      role="region"
      aria-label="Camera safety monitor"
      style={{
        margin: "12px 0",
        padding: 12,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        maxWidth: 360,
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: "bold", color: colors.danger }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "red" }} />
          <span>LIVE SAFETY MONITORING (2 FPS)</span>
        </div>
        <button
          onClick={onDisable}
          style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer" }}
          aria-label="Turn off camera"
        >
          Disable Camera
        </button>
      </div>

      <div style={{ position: "relative", width: "100%", height: 200, background: "#000", borderRadius: 6, overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: blurFace ? "blur(14px)" : "none",
            transition: "filter 0.3s ease",
          }}
        />
        {blurFace && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            🛡️ HIPAA Face Blur Active
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={blurFace}
            onChange={(e) => setBlurFace(e.target.checked)}
          />
          <span>HIPAA Face Anonymization</span>
        </label>
        <span style={{ fontSize: 11, color: colors.textSecondary }}>Local frame analysis</span>
      </div>
    </div>
  );
}
