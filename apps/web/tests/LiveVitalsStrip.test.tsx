import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import {
  LiveVitalsStrip,
  extractVitalsFromSpeech,
} from "../src/components/panels/LiveVitalsStrip";

describe("LiveVitalsStrip", () => {
  it("extracts BP, SpO2, Pulse, and Temp from speech utterances", () => {
    const utterances = [
      "Hello doctor, I came for my checkup.",
      "Your blood pressure is 145/92 and oxygen saturation is 94 percent.",
      "Pulse rate of 105 bpm and temperature 101.4 F.",
    ];

    const vitals = extractVitalsFromSpeech(utterances);
    expect(vitals.bpSystolic).toBe(145);
    expect(vitals.bpDiastolic).toBe(92);
    expect(vitals.spo2).toBe(94);
    expect(vitals.heartRate).toBe(105);
    expect(vitals.temperature).toBe(101.4);
  });

  it("renders triage status badges for extracted vitals", () => {
    const utterances = ["BP is 145/95 and pulse 105 bpm"];

    render(
      <ThemeProvider>
        <LiveVitalsStrip utterances={utterances} />
      </ThemeProvider>,
    );

    expect(screen.getByText("145/95")).toBeTruthy();
    expect(screen.getByText("Stage 2 HTN")).toBeTruthy();
    expect(screen.getByText("Tachycardia")).toBeTruthy();
  });

  it("allows manual editing of vitals", () => {
    const onVitalsChange = vi.fn();
    render(
      <ThemeProvider>
        <LiveVitalsStrip utterances={[]} onVitalsChange={onVitalsChange} />
      </ThemeProvider>,
    );

    const editBtn = screen.getByRole("button", { name: /manual edit/i });
    fireEvent.click(editBtn);

    expect(screen.getByText(/BP Sys:/i)).toBeTruthy();
    expect(screen.getByText(/SpO2 \(%\):/i)).toBeTruthy();

    const doneBtn = screen.getByRole("button", { name: /done/i });
    fireEvent.click(doneBtn);
    expect(screen.getByText(/manual edit/i)).toBeTruthy();
  });
});
