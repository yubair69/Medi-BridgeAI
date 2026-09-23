"""Pydantic schemas for Clinical Decision Support (CDS) DDI & Allergy checker."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class DrugInteractionAlert(BaseModel):
    drug_a: str = Field(description="First interacting drug or drug class")
    drug_b: str = Field(description="Second interacting drug or drug class")
    severity: Literal["CRITICAL", "MAJOR", "MODERATE", "MINOR"] = Field(
        description="Clinical interaction severity level"
    )
    mechanism: str = Field(description="Pharmacological mechanism of interaction")
    clinical_risk: str = Field(description="Patient adverse outcome or danger")
    recommendation: str = Field(description="Actionable mitigation advice for attending clinician")


class AllergyAlert(BaseModel):
    allergen: str = Field(description="Stated patient allergen or drug family")
    medication: str = Field(description="Contradicted prescribed medication")
    severity: Literal["CRITICAL", "MAJOR"] = Field(
        default="CRITICAL",
        description="Anaphylaxis or severe hypersensitivity risk"
    )
    reaction_risk: str = Field(description="Nature of anticipated adverse allergic reaction")
    recommendation: str = Field(description="Actionable mitigation or alternative therapy")


class CdsCheckRequest(BaseModel):
    medications: list[str] = Field(
        default_factory=list,
        description="List of medication names discussed or prescribed in session",
    )
    patient_utterances: list[str] = Field(
        default_factory=list,
        description="Patient utterances to scan for reported drug allergies",
    )
    known_allergies: list[str] = Field(
        default_factory=list,
        description="Pre-existing known drug allergies if available",
    )


class CdsCheckResponse(BaseModel):
    interactions: list[DrugInteractionAlert] = Field(default_factory=list)
    allergies: list[AllergyAlert] = Field(default_factory=list)
    total_alerts: int = 0
    has_critical: bool = False
