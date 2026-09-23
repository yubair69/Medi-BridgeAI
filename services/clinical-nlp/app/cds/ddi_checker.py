"""Clinical Decision Support (CDS) Drug-Drug Interaction and Allergy Safety Engine.

Provides clinical rule-based detection for severe pharmacodynamic and pharmacokinetic
drug-drug interactions, and cross-checks patient-reported drug allergies against
prescribed or discussed therapies.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

from app.cds.schemas import (
    AllergyAlert,
    CdsCheckRequest,
    CdsCheckResponse,
    DrugInteractionAlert,
)


@dataclass(frozen=True)
class InteractionRule:
    group_a: tuple[str, ...]
    group_b: tuple[str, ...]
    severity: str  # "CRITICAL", "MAJOR", "MODERATE", "MINOR"
    mechanism: str
    clinical_risk: str
    recommendation: str


_RULES: list[InteractionRule] = [
    InteractionRule(
        group_a=("warfarin", "coumadin", "heparin", "dabigatran", "rivaroxaban", "apixaban", "varsurin", "warfare", "warfar"),
        group_b=("aspirin", "ibuprofen", "naproxen", "diclofenac", "ketorolac", "nsaid", "nsaids", "indomethacin", "primitive"),
        severity="CRITICAL",
        mechanism="Concurrent antiplatelet/NSAID mucosal injury and systemic anticoagulation",
        clinical_risk="Severe gastrointestinal hemorrhage, major systemic bleeding events",
        recommendation="Avoid combination unless specifically indicated (e.g. triple therapy post-PCI). Consider gastroprotection (PPI) or switch to paracetamol for analgesia.",
    ),
    InteractionRule(
        group_a=("lisinopril", "enalapril", "ramipril", "losartan", "valsartan", "telmisartan", "irbesartan"),
        group_b=("spironolactone", "eplerenone", "potassium", "kcl", "triamterene"),
        severity="MAJOR",
        mechanism="Synergistic potassium retention via RAAS blockade and aldosterone inhibition",
        clinical_risk="Life-threatening hyperkalemia, cardiac conduction abnormalities, arrhythmias",
        recommendation="Monitor serum potassium and creatinine within 7-14 days. Advise patient on symptoms of weakness or palpitations.",
    ),
    InteractionRule(
        group_a=("metformin", "glucophage"),
        group_b=("contrast", "radiocontrast", "iohexol", "iopamidol"),
        severity="MAJOR",
        mechanism="Contrast-induced nephropathy leading to systemic accumulation of metformin",
        clinical_risk="Lactic acidosis with significant mortality risk",
        recommendation="Temporarily discontinue metformin prior to or at time of iodinated contrast study; resume after 48 hours following confirmed normal renal function.",
    ),
    InteractionRule(
        group_a=("fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram", "venlafaxine", "duloxetine"),
        group_b=("tramadol", "linezolid", "selegiline", "phenelzine", "rasagiline", "maoi"),
        severity="CRITICAL",
        mechanism="Dual enhancement of synaptic serotonin levels and inhibition of reuptake",
        clinical_risk="Serotonin Syndrome (hyperthermia, neuromuscular clonus, delirium, autonomic instability)",
        recommendation="Avoid concurrent prescription. If opioid analgesia needed, consider non-serotonergic alternative (e.g. morphine, oxycodone) or acetaminophen.",
    ),
    InteractionRule(
        group_a=("atorvastatin", "simvastatin", "lovastatin"),
        group_b=("azithromycin", "clarithromycin", "erythromycin"),
        severity="MAJOR",
        mechanism="Potent CYP3A4 inhibition by macrolide antibiotic increasing statin bioavailability",
        clinical_risk="Severe myopathy and acute rhabdomyolysis resulting in renal failure",
        recommendation="Temporarily suspend statin therapy for the duration of macrolide treatment, or select an alternative antibiotic.",
    ),
    InteractionRule(
        group_a=("metoprolol", "atenolol", "carvedilol", "propranolol", "bisoprolol"),
        group_b=("verapamil", "diltiazem"),
        severity="CRITICAL",
        mechanism="Additive negative inotropic and dromotropic actions on AV nodal conduction",
        clinical_risk="Profound symptomatic bradycardia, complete atrioventricular block, cardiogenic shock",
        recommendation="Co-administration generally contraindicated in outpatient practice. Continuous ECG monitoring required if clinically unavoidable.",
    ),
    InteractionRule(
        group_a=("ciprofloxacin", "levofloxacin", "norfloxacin", "moxifloxacin"),
        group_b=("antacids", "antacid", "sucralfate", "calcium", "iron", "magnesium", "ferrous"),
        severity="MODERATE",
        mechanism="Polyvalent cations chelate fluoroquinolones, preventing gastrointestinal absorption",
        clinical_risk="Marked loss of antibiotic efficacy (up to 90% reduction in AUC), treatment failure",
        recommendation="Administer fluoroquinolone at least 2 hours before or 6 hours after metal cation-containing supplements/antacids.",
    ),
    InteractionRule(
        group_a=("methotrexate",),
        group_b=("ibuprofen", "naproxen", "diclofenac", "aspirin", "nsaid"),
        severity="MAJOR",
        mechanism="NSAIDs reduce renal tubular secretion and protein binding of methotrexate",
        clinical_risk="Methotrexate toxicity, acute bone marrow suppression, pancytopenia, hepatotoxicity",
        recommendation="Avoid NSAIDs with high-dose methotrexate; monitor blood counts and renal function closely if low-dose concurrent therapy used.",
    ),
]

# Common allergy families and cross-reacting drugs
_ALLERGY_FAMILIES: dict[str, tuple[str, ...]] = {
    "penicillin": ("penicillin", "amoxicillin", "ampicillin", "augmentin", "amox-clav", "piperacillin", "amoxil", "palicillin", "hemocillin", "palestinine", "palisthenic"),
    "sulfa": ("bactrim", "septra", "cotrimoxazole", "sulfamethoxazole", "sulfadiazine", "sulfa"),
    "cephalosporin": ("cephalexin", "cefuroxime", "ceftriaxone", "cefixime", "cefotaxime", "cefazolin"),
    "aspirin": ("aspirin", "ecosprin", "disprin"),
    "nsaid": ("ibuprofen", "naproxen", "diclofenac", "ketorolac", "brufen", "combiflam"),
    "macrolide": ("azithromycin", "clarithromycin", "erythromycin", "azithral", "zithromax"),
}

_ALLERGY_PATTERNS = [
    re.compile(r"\ballerg(?:y|ic)\s+(?:to\s+)?([a-z\-]+)\b", re.IGNORECASE),
    re.compile(r"\b([a-z\-]+)\s+(?:se\s+)?allergy\s+hai\b", re.IGNORECASE),
    re.compile(r"\breaction\s+(?:to\s+)?([a-z\-]+)\b", re.IGNORECASE),
    re.compile(r"\bcannot\s+take\s+([a-z\-]+)\b", re.IGNORECASE),
    re.compile(r"\b([a-z\-]+)\s+allergy\b", re.IGNORECASE),
]



def _normalize(name: str) -> str:
    return name.strip().lower()


def check_drug_interactions(medications: Sequence[str]) -> list[DrugInteractionAlert]:
    """Evaluates a list of medication names for pairwise drug interactions."""
    if len(medications) < 2:
        return []

    norm_meds = [_normalize(m) for m in medications if m.strip()]
    alerts: list[DrugInteractionAlert] = []
    seen_pairs: set[tuple[str, str]] = set()

    for rule in _RULES:
        # Check if any med matches group_a and another matches group_b
        matches_a = [m for m in norm_meds if any(alias in m for alias in rule.group_a)]
        matches_b = [m for m in norm_meds if any(alias in m for alias in rule.group_b)]

        for a in matches_a:
            for b in matches_b:
                if a == b:
                    continue
                pair_key = tuple(sorted((a, b)))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)

                alerts.append(
                    DrugInteractionAlert(
                        drug_a=a.capitalize(),
                        drug_b=b.capitalize(),
                        severity=rule.severity,  # type: ignore[arg-type]
                        mechanism=rule.mechanism,
                        clinical_risk=rule.clinical_risk,
                        recommendation=rule.recommendation,
                    )
                )

    return alerts


def detect_patient_allergies(
    patient_utterances: Sequence[str],
    known_allergies: Sequence[str],
) -> set[str]:
    """Extracts stated patient drug allergies from transcript utterances and known list."""
    allergens: set[str] = set(_normalize(a) for a in known_allergies if a.strip())

    for u in patient_utterances:
        text = u.lower()
        for pat in _ALLERGY_PATTERNS:
            for match in pat.finditer(text):
                candidate = match.group(1).lower().strip()
                # Check if candidate matches any known allergy family or drug name
                for fam, drugs in _ALLERGY_FAMILIES.items():
                    if candidate == fam or any(candidate in d for d in drugs):
                        allergens.add(fam)
                        allergens.add(candidate)
                        break

    return allergens


def check_allergy_contraindications(
    medications: Sequence[str],
    allergens: set[str],
) -> list[AllergyAlert]:
    """Identifies prescribed medications contraindicated by detected patient allergies."""
    if not medications or not allergens:
        return []

    alerts: list[AllergyAlert] = []
    seen: set[tuple[str, str]] = set()

    for med in medications:
        med_norm = _normalize(med)
        for allergen in allergens:
            # Check family membership
            family_drugs = _ALLERGY_FAMILIES.get(allergen, (allergen,))
            if any(alias in med_norm for alias in family_drugs) or allergen in med_norm:
                pair = (allergen, med_norm)
                if pair not in seen:
                    seen.add(pair)
                    alerts.append(
                        AllergyAlert(
                            allergen=allergen.capitalize(),
                            medication=med.capitalize(),
                            severity="CRITICAL",
                            reaction_risk=f"High risk of acute hypersensitivity / anaphylaxis with {allergen} exposure",
                            recommendation=f"Immediately discontinue {med.capitalize()}; choose an alternative drug class not cross-reactive with {allergen}.",
                        )
                    )

    return alerts


def evaluate_cds(request: CdsCheckRequest) -> CdsCheckResponse:
    """Entrypoint function for CDS checking: runs DDI and Allergy contraindication analysis."""
    interactions = check_drug_interactions(request.medications)
    allergens = detect_patient_allergies(request.patient_utterances, request.known_allergies)
    allergy_alerts = check_allergy_contraindications(request.medications, allergens)

    total = len(interactions) + len(allergy_alerts)
    has_crit = any(i.severity == "CRITICAL" for i in interactions) or any(
        a.severity == "CRITICAL" for a in allergy_alerts
    )

    return CdsCheckResponse(
        interactions=interactions,
        allergies=allergy_alerts,
        total_alerts=total,
        has_critical=has_crit,
    )
