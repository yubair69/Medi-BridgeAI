import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { VideoMonitorPanel } from "../src/components/panels/VideoMonitorPanel";

describe("VideoMonitorPanel", () => {
  it("renders nothing when stream is null", () => {
    const { container } = render(
      <ThemeProvider>
        <VideoMonitorPanel stream={null} onDisable={vi.fn()} />
      </ThemeProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders live monitor when stream is provided", () => {
    const mockStream = {} as MediaStream;
    const onDisable = vi.fn();

    render(
      <ThemeProvider>
        <VideoMonitorPanel stream={mockStream} onDisable={onDisable} />
      </ThemeProvider>,
    );

    expect(screen.getByRole("region", { name: /camera safety monitor/i })).toBeTruthy();
    expect(screen.getByText(/LIVE SAFETY MONITORING/i)).toBeTruthy();
    expect(screen.getByText(/HIPAA Face Blur Active/i)).toBeTruthy();

    const disableBtn = screen.getByRole("button", { name: /turn off camera/i });
    fireEvent.click(disableBtn);
    expect(onDisable).toHaveBeenCalledOnce();
  });

  it("toggles HIPAA face blur on checkbox change", () => {
    const mockStream = {} as MediaStream;
    render(
      <ThemeProvider>
        <VideoMonitorPanel stream={mockStream} onDisable={vi.fn()} />
      </ThemeProvider>,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(screen.getByText(/HIPAA Face Blur Active/i)).toBeTruthy();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText(/HIPAA Face Blur Active/i)).toBeNull();
  });
});
