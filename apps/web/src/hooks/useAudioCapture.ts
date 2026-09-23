import { useCallback, useRef, useState } from "react";
import { computeRmsLevel, downsampleBuffer, floatTo16BitPCM } from "../audio/pcm";

const TARGET_SAMPLE_RATE = 16_000;
const BUFFER_SIZE = 4096;

/** Minimal shape used from AudioContext -- lets tests inject a fake without
 * needing a full jsdom Web Audio implementation (jsdom has none). */
export interface AudioContextLike {
  sampleRate: number;
  state?: string;
  createMediaStreamSource(stream: MediaStream): { connect(node: unknown): void };
  createScriptProcessor(
    bufferSize: number,
    numberOfInputChannels: number,
    numberOfOutputChannels: number,
  ): ScriptProcessorNodeLike;
  destination: unknown;
  resume?(): Promise<void>;
  close(): Promise<void>;
}

export interface ScriptProcessorNodeLike {
  onaudioprocess: ((event: { inputBuffer: { getChannelData(channel: number): Float32Array } }) => void) | null;
  connect(node: unknown): void;
  disconnect(): void;
}

export interface UseAudioCaptureOptions {
  onChunk: (chunk: ArrayBuffer) => void;
  /** Fired alongside onChunk with a 0-1 amplitude level, for a live
   * waveform/level-meter animation (Blueprint Section 2.4). Optional --
   * callers that don't need a visual meter can omit it at no extra cost. */
  onLevel?: (level: number) => void;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createAudioContext?: () => AudioContextLike;
}

export interface AudioCaptureState {
  isRecording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Captures mic audio and delivers PCM16/16kHz mono chunks via onChunk.
 *
 * Uses ScriptProcessorNode (deprecated but universally supported, no
 * separate AudioWorklet module file to load) -- acceptable for Phase 1
 * scope; migrating to AudioWorkletNode is a documented follow-up
 * (docs/PROGRESS.md), not a Phase 1 blocker.
 *
 * Consent (Blueprint Section 14: explicit informed consent before recording
 * starts) is the caller's responsibility -- this hook only starts capturing
 * when `start()` is invoked, never automatically.
 */
export function useAudioCapture(options: UseAudioCaptureOptions): AudioCaptureState {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContextLike | null>(null);
  const processorRef = useRef<ScriptProcessorNodeLike | null>(null);
  const onChunkRef = useRef(options.onChunk);
  onChunkRef.current = options.onChunk;
  const onLevelRef = useRef(options.onLevel);
  onLevelRef.current = options.onLevel;

  const getUserMediaRef = useRef(options.getUserMedia);
  getUserMediaRef.current = options.getUserMedia;
  const createAudioContextRef = useRef(options.createAudioContext);
  createAudioContextRef.current = options.createAudioContext;

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    void contextRef.current?.close().catch(() => undefined);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current = null;
    contextRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const getUserMedia =
        getUserMediaRef.current ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
      const createAudioContext =
        createAudioContextRef.current ??
        ((): AudioContextLike => new AudioContext() as unknown as AudioContextLike);

      const stream = await getUserMedia({ audio: true });
      streamRef.current = stream;

      const context = createAudioContext();
      contextRef.current = context;
      if (context.state === "suspended" && typeof context.resume === "function") {
        await context.resume();
      }
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(input, context.sampleRate, TARGET_SAMPLE_RATE);
        onChunkRef.current(floatTo16BitPCM(downsampled));
        onLevelRef.current?.(computeRmsLevel(input));
      };

      source.connect(processor);
      // ScriptProcessorNode only fires onaudioprocess while connected into
      // the graph toward destination; muted playback avoids mic echo.
      processor.connect(context.destination);
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start microphone capture");
      setIsRecording(false);
    }
  }, []);

  return { isRecording, error, start, stop };
}
