import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { DdiAlertBanner, type DrugInteractionItem, type AllergyItem } from "../src/components/alerts/DdiAlertBanner";

describe("DdiAlertBanner", () => {
  it("renders nothing when there are no alerts", () => {
    const { container } = render(
      <ThemeProvider>
        <DdiAlertBanner interactions={[]} allergies={[]} />
      </ThemeProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders critical DDI warning correctly", () => {
    const mockDdi: DrugInteractionItem[] = [
      {
        drug_a: "Warfarin",
        drug_b: "Aspirin",
        severity: "CRITICAL",
        mechanism: "Concurrent platelet inhibition and anticoagulation",
        clinical_risk: "Severe GI bleeding",
        recommendation: "Avoid combination or use gastroprotection",
      },
    ];

    render(
      <ThemeProvider>
        <DdiAlertBanner interactions={mockDdi} allergies={[]} />
      </ThemeProvider>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Warfarin \+ Aspirin/i)).toBeTruthy();
    expect(screen.getByText(/Severe GI bleeding/i)).toBeTruthy();
    expect(screen.getByText(/CRITICAL DDI/i)).toBeTruthy();
  });

  it("renders allergy contraindication alert", () => {
    const mockAllergy: AllergyItem[] = [
      {
        allergen: "Penicillin",
        medication: "Amoxicillin",
        severity: "CRITICAL",
        reaction_risk: "High risk of anaphylaxis",
        recommendation: "Discontinue immediately and switch class",
      },
    ];

    render(
      <ThemeProvider>
        <DdiAlertBanner interactions={[]} allergies={mockAllergy} />
      </ThemeProvider>,
    );

    expect(screen.getByText(/ALLERGY CONTRAINDICATION/i)).toBeTruthy();
    expect(screen.getByText(/Penicillin Allergy ✕ Amoxicillin/i)).toBeTruthy();
    expect(screen.getByText(/High risk of anaphylaxis/i)).toBeTruthy();
  });

  it("dismisses alert on clicking dismiss button", () => {
    const onDismiss = vi.fn();
    const mockDdi: DrugInteractionItem[] = [
      {
        drug_a: "Warfarin",
        drug_b: "Aspirin",
        severity: "CRITICAL",
        mechanism: "Bleeding",
        clinical_risk: "Hemorrhage",
        recommendation: "Avoid",
      },
    ];

    render(
      <ThemeProvider>
        <DdiAlertBanner interactions={mockDdi} allergies={[]} onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    const btn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
