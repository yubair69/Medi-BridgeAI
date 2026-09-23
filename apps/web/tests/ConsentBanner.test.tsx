import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { ConsentBanner } from "../src/components/alerts/ConsentBanner";

function renderBanner(onConsent = vi.fn()) {
  return render(
    <ThemeProvider>
      <ConsentBanner onConsent={onConsent} />
    </ThemeProvider>,
  );
}

describe("ConsentBanner", () => {
  it("renders consent dialog", () => {
    renderBanner();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/enable camera safety monitoring/i)).toBeTruthy();
  });

  it("calls onConsent(true) when 'Enable camera' is clicked", () => {
    const onConsent = vi.fn();
    renderBanner(onConsent);
    fireEvent.click(screen.getByRole("button", { name: /enable camera safety monitoring/i }));
    expect(onConsent).toHaveBeenCalledWith(true);
  });

  it("calls onConsent(false) when 'No thanks' is clicked", () => {
    const onConsent = vi.fn();
    renderBanner(onConsent);
    fireEvent.click(screen.getByRole("button", { name: /decline camera access/i }));
    expect(onConsent).toHaveBeenCalledWith(false);
  });

  it("hides the dialog after a choice is made", () => {
    const { container } = renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /decline camera access/i }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
