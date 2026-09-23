import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportModal } from "../src/components/panels/ExportModal";
import { ThemeProvider } from "../src/theme/ThemeProvider";

describe("ExportModal", () => {
  it("renders modal when open with export options", () => {
    const handleClose = vi.fn();
    render(
      <ThemeProvider>
        <ExportModal
          isOpen={true}
          onClose={handleClose}
          sessionId="test-session-123"
          events={[]}
          entities={[]}
          summary={null}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("dialog", { name: /export consultation record/i })).toBeDefined();
    expect(screen.getByText(/EHR Clinical Note/i)).toBeDefined();
    expect(screen.getByText(/FHIR \/ JSON/i)).toBeDefined();
    expect(screen.getByText(/Printable \/ PDF/i)).toBeDefined();
    expect(screen.getByText(/Apply HIPAA Safe Harbor 18 PHI De-identification/i)).toBeDefined();
  });

  it("calls onClose when Cancel is clicked", () => {
    const handleClose = vi.fn();
    render(
      <ThemeProvider>
        <ExportModal
          isOpen={true}
          onClose={handleClose}
          sessionId="test-session-123"
          events={[]}
          entities={[]}
          summary={null}
        />
      </ThemeProvider>
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);
    expect(handleClose).toHaveBeenCalledOnce();
  });
});
