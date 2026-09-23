import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { VisionAlertCard } from "../src/components/alerts/VisionAlertCard";

function renderCard(onAcknowledge = vi.fn()) {
  return render(
    <ThemeProvider>
      <VisionAlertCard reason="Patient may have collapsed." onAcknowledge={onAcknowledge} />
    </ThemeProvider>,
  );
}

describe("VisionAlertCard", () => {
  it("renders the alert reason", () => {
    renderCard();
    expect(screen.getByText("Patient may have collapsed.")).toBeTruthy();
  });

  it("acknowledge button is disabled until confirmation checkbox is checked", () => {
    renderCard();
    const btn = screen.getByRole("button", { name: /acknowledge/i });
    expect(btn).toBeDisabled();
  });

  it("acknowledge button enables after checking the confirmation checkbox", () => {
    renderCard();
    fireEvent.click(screen.getByRole("checkbox"));
    const btn = screen.getByRole("button", { name: /acknowledge/i });
    expect(btn).not.toBeDisabled();
  });

  it("calls onAcknowledge when button clicked after confirmation", () => {
    const onAck = vi.fn();
    renderCard(onAck);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /acknowledge/i }));
    expect(onAck).toHaveBeenCalledOnce();
  });
});
