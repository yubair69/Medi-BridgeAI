import { useEffect, useRef } from "react";
import { useTheme } from "../../theme/ThemeProvider";

export interface WaveVisualizerProps {
  level: number;
  active: boolean;
  speakerRole?: string;
}

/**
 * Calming fluid multi-layered audio wave visualizer.
 * Renders soothing animated wave ribbons on an HTML5 canvas,
 * smoothly reacting to microphone volume level and animating gently even when silent.
 */
export function WaveVisualizer({ level, active, speakerRole }: WaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { mode } = useTheme();
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const targetLevelRef = useRef<number>(0);
  const smoothedLevelRef = useRef<number>(0);

  useEffect(() => {
    targetLevelRef.current = active ? Math.max(0.08, Math.min(1, level)) : 0.04;
  }, [level, active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width === 0 || height === 0) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      // Smooth audio level dampening
      smoothedLevelRef.current += (targetLevelRef.current - smoothedLevelRef.current) * 0.15;
      const amp = smoothedLevelRef.current * (height * 0.38);

      phaseRef.current += active ? 0.04 + smoothedLevelRef.current * 0.05 : 0.015;
      const phase = phaseRef.current;

      ctx.clearRect(0, 0, width, height);

      // Define 3 wave layers with harmonious offsets and color palettes
      const isDark = mode === "dark";
      const waveLayers = [
        {
          frequency: 0.012,
          speed: phase,
          amplitude: amp * 1.0,
          colorA: isDark ? "rgba(14, 165, 233, 0.45)" : "rgba(2, 132, 199, 0.35)",
          colorB: isDark ? "rgba(6, 182, 212, 0.0)" : "rgba(14, 165, 233, 0.0)",
          lineWidth: 2.5,
          yOffset: 0,
        },
        {
          frequency: 0.018,
          speed: phase * 1.3 + 1.2,
          amplitude: amp * 0.75,
          colorA: isDark ? "rgba(16, 185, 129, 0.5)" : "rgba(5, 150, 105, 0.4)",
          colorB: isDark ? "rgba(52, 211, 153, 0.0)" : "rgba(16, 185, 129, 0.0)",
          lineWidth: 2,
          yOffset: 4,
        },
        {
          frequency: 0.008,
          speed: phase * 0.7 + 2.5,
          amplitude: amp * 0.55,
          colorA: isDark ? "rgba(99, 102, 241, 0.4)" : "rgba(79, 70, 229, 0.3)",
          colorB: isDark ? "rgba(129, 140, 248, 0.0)" : "rgba(99, 102, 241, 0.0)",
          lineWidth: 1.5,
          yOffset: -3,
        },
      ];

      const centerY = height / 2;

      waveLayers.forEach((layer) => {
        ctx.beginPath();
        ctx.moveTo(0, centerY);

        for (let x = 0; x <= width; x += 4) {
          const normalizedX = x / width;
          const windowMultiplier = Math.sin(Math.PI * normalizedX);
          const y =
            centerY +
            layer.yOffset +
            Math.sin(x * layer.frequency + layer.speed) *
              layer.amplitude *
              windowMultiplier +
            Math.cos(x * layer.frequency * 0.5 - layer.speed * 0.5) *
              (layer.amplitude * 0.3) *
              windowMultiplier;

          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, centerY - layer.amplitude, 0, height);
        grad.addColorStop(0, layer.colorA);
        grad.addColorStop(1, layer.colorB);

        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        for (let x = 0; x <= width; x += 4) {
          const normalizedX = x / width;
          const windowMultiplier = Math.sin(Math.PI * normalizedX);
          const y =
            centerY +
            layer.yOffset +
            Math.sin(x * layer.frequency + layer.speed) *
              layer.amplitude *
              windowMultiplier +
            Math.cos(x * layer.frequency * 0.5 - layer.speed * 0.5) *
              (layer.amplitude * 0.3) *
              windowMultiplier;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = layer.colorA;
        ctx.lineWidth = layer.lineWidth;
        ctx.stroke();
      });

      if (active && smoothedLevelRef.current > 0.1) {
        const beaconGrad = ctx.createRadialGradient(
          width / 2,
          centerY,
          0,
          width / 2,
          centerY,
          width * 0.35,
        );
        beaconGrad.addColorStop(
          0,
          isDark
            ? `rgba(6, 182, 212, ${Math.min(0.25, smoothedLevelRef.current * 0.3)})`
            : `rgba(14, 165, 233, ${Math.min(0.18, smoothedLevelRef.current * 0.2)})`,
        );
        beaconGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = beaconGrad;
        ctx.fillRect(0, 0, width, height);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mode, active]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "120px",
        overflow: "hidden",
        borderRadius: "14px",
        background:
          mode === "dark"
            ? "linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(10, 15, 29, 0.9) 100%)"
            : "linear-gradient(180deg, rgba(240, 249, 255, 0.7) 0%, rgba(224, 242, 254, 0.9) 100%)",
        border:
          mode === "dark"
            ? "1px solid rgba(56, 189, 248, 0.2)"
            : "1px solid rgba(186, 230, 253, 0.8)",
        boxShadow:
          mode === "dark"
            ? "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px rgba(0,0,0,0.3)"
            : "inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 4px 16px rgba(14, 165, 233, 0.08)",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
      {/* Real-time status badge overlay */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: active
            ? mode === "dark"
              ? "#38bdf8"
              : "#0284c7"
            : mode === "dark"
              ? "#94a3b8"
              : "#64748b",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: active ? "#10b981" : "#64748b",
            boxShadow: active ? "0 0 10px #10b981" : "none",
          }}
        />
        <span>{active ? "Live Acoustic Waveform" : "Acoustic Standby"}</span>
        {speakerRole && (
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "4px",
              background: mode === "dark" ? "rgba(56, 189, 248, 0.15)" : "rgba(2, 132, 199, 0.1)",
              color: mode === "dark" ? "#7dd3fc" : "#0369a1",
              fontSize: "10px",
            }}
          >
            {speakerRole}
          </span>
        )}
      </div>
    </div>
  );
}
