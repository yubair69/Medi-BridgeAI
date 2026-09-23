import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { PrescriptionSlipModal } from "../src/components/panels/PrescriptionSlipModal";
import type { StructuredSummary } from "../src/hooks/useConversationMemory";

describe("PrescriptionSlipModal", () => {
  const mockSummary: StructuredSummary = {
    patient_info: "Male, 45",
    complaints: [{ text: "Fever and cough", source_utterance_id: "u1" }],
    symptoms: [],
    objective: [],
    diagnoses_mentioned: [],
    medications: [
      { text: "Paracetamol 500mg tid", source_utterance_id: "u2" },
      { text: "Azithromycin 500mg od", source_utterance_id: "u3" },
    ],
    recommendations: [{ text: "Drink plenty of fluids and rest", source_utterance_id: "u4" }],
    action_items: [],
    follow_up: [{ text: "Review after 3 days", source_utterance_id: "u5" }],
    discarded_ungrounded_count: 0,
    model_name: "test-model",
  };

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <ThemeProvider>
        <PrescriptionSlipModal
          isOpen={false}
          onClose={vi.fn()}
          summary={mockSummary}
        />
      </ThemeProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders prescription slip with clinic title and medication table", () => {
    render(
      <ThemeProvider>
        <PrescriptionSlipModal
          isOpen={true}
          onClose={vi.fn()}
          summary={mockSummary}
          vitals={{ bpSystolic: 120, bpDiastolic: 80, heartRate: 72 }}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("MediBridge Telehealth Clinic")).toBeTruthy();
    expect(screen.getByText("120/80 mmHg")).toBeTruthy();
    expect(screen.getByText("Paracetamol 500mg tid")).toBeTruthy();
    expect(screen.getByText("Azithromycin 500mg od")).toBeTruthy();
    expect(screen.getByText(/Review after 3 days/i)).toBeTruthy();
  });

  it("triggers window.print when print button is clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <ThemeProvider>
        <PrescriptionSlipModal
          isOpen={true}
          onClose={vi.fn()}
          summary={mockSummary}
        />
      </ThemeProvider>,
    );

    const printBtn = screen.getByRole("button", { name: /print/i });
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <PrescriptionSlipModal
          isOpen={true}
          onClose={onClose}
          summary={mockSummary}
        />
      </ThemeProvider>,
    );

    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
