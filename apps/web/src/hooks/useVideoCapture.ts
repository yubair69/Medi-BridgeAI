import { useCallback, useEffect, useRef, useState } from "react";
import { GATEWAY_HTTP_URL } from "../config";

export interface UseVideoCaptureOptions {
  sessionId: string | null;
  enabled: boolean;
  fps?: number;
  gatewayUrl?: string;
}

export interface VideoCaptureAlert {
  reason: string;
  sessionId: string;
}

export interface UseVideoCaptureState {
  alert: VideoCaptureAlert | null;
  error: string | null;
  clearAlert: () => void;
  mediaStream: MediaStream | null;
  facePosition: { cx: number; cy: number } | null;
}

/** Captures camera frames at ~2fps and POSTs them to the vision-service
 * via the gateway. Only runs when `enabled` is true (i.e. after consent).
 * Frame capture uses an offscreen canvas to convert video frames to JPEG. */
export function useVideoCapture({
  sessionId,
  enabled,
  fps = 2,
  gatewayUrl = GATEWAY_HTTP_URL,
}: UseVideoCaptureOptions): UseVideoCaptureState {
  const [alert, setAlert] = useState<VideoCaptureAlert | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [facePosition, setFacePosition] = useState<{ cx: number; cy: number } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const clearAlert = useCallback(() => setAlert(null), []);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    let stopped = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMediaStream(stream);

        const video = document.createElement("video");
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        videoRef.current = video;

        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        canvasRef.current = canvas;

        intervalRef.current = setInterval(() => {
          if (stopped || !videoRef.current || !canvasRef.current || !sessionId) return;
          const ctx = canvasRef.current.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          // toDataURL gives "data:image/jpeg;base64,<data>" — strip prefix
          const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.7);
          const frame_b64 = dataUrl.split(",")[1];
          if (!frame_b64) return;

          void fetch(`${gatewayUrl}/sessions/${encodeURIComponent(sessionId)}/vision/frame`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, frame_b64 }),
          })
            .then(async (res) => {
              if (!res.ok) return;
              const body = (await res.json()) as {
                alert_triggered: boolean;
                alert_reason: string | null;
                face_cx: number | null;
                face_cy: number | null;
              };
              if (body.alert_triggered && body.alert_reason) {
                setAlert({ reason: body.alert_reason, sessionId });
              }
              if (body.face_cx != null && body.face_cy != null) {
                setFacePosition({ cx: body.face_cx, cy: body.face_cy });
              } else {
                setFacePosition(null);
              }
            })
            .catch(() => {
              // vision-service unreachable — camera features silently
              // degrade, audio pipeline unaffected (Blueprint §3.3)
            });
        }, Math.round(1000 / fps));
      } catch (err) {
        if (!stopped) {
          setError(err instanceof Error ? err.message : "Camera unavailable.");
        }
      }
    }

    void start();

    return () => {
      stopped = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      videoRef.current = null;
      setMediaStream(null);
    };
  }, [enabled, sessionId, fps, gatewayUrl]);

  return { alert, error, clearAlert, mediaStream, facePosition };
}
