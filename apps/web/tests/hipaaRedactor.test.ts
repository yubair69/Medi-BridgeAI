import { describe, expect, it } from "vitest";
import { redactClientPHI } from "../src/utils/hipaaRedactor";

describe("redactClientPHI", () => {
  it("redacts email, phone, and SSN", () => {
    const text = "Contact patient John Doe at doc@hospital.org or 9876543210. SSN: 123-45-6789.";
    const result = redactClientPHI(text);

    expect(result.phiFound).toBe(true);
    expect(result.redactedText).toContain("<EMAIL>");
    expect(result.redactedText).toContain("<PHONE>");
    expect(result.redactedText).toContain("<SSN>");
    expect(result.redactedText).not.toContain("doc@hospital.org");
    expect(result.redactedText).not.toContain("9876543210");
    expect(result.redactedText).not.toContain("123-45-6789");
  });

  it("redacts Indian health identifiers (Aadhaar, ABHA)", () => {
    const text = "Aadhaar: 1234 5678 9012 and ABHA ID: 14-1234-5678-9012.";
    const result = redactClientPHI(text);

    expect(result.phiFound).toBe(true);
    expect(result.redactedText).toContain("<AADHAAR>");
    expect(result.redactedText).toContain("<ABHA>");
  });

  it("leaves text unchanged when no PHI is present", () => {
    const text = "Patient has mild fever and cough for two days.";
    const result = redactClientPHI(text);

    expect(result.phiFound).toBe(false);
    expect(result.redactedText).toBe(text);
  });
});
