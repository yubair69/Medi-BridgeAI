/**
 * Client-side HIPAA Safe Harbor 18 PHI Redactor.
 * Complies with 45 CFR § 164.514(b)(2).
 */

const SSN_REGEX = /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
const PHONE_REGEX = /\b(?:\+?91[\-\s]?)?[6-9]\d{9}\b|\b(?:\+?1[\-\s]?)?\(?\d{3}\)?[\-\s]?\d{3}[\-\s]?\d{4}\b/g;
const MRN_REGEX = /\b(?:mrn|medical\s*record(?:\s*number)?|patient\s*id|chart\s*#?)\s*[:#-]?\s*([A-Za-z0-9\-]{5,15})\b/gi;
const AADHAAR_REGEX = /\b\d{4}\s\d{4}\s\d{4}\b/g;
const ABHA_REGEX = /\b\d{2}-\d{4}-\d{4}-\d{4}\b/g;
const IP_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
const DATE_REGEX = /\b(?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01])[\/\-.](?:19|20)\d{2}\b|\b(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:19|20)\d{2}\b/g;
const NAME_PREFIX_REGEX = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Doctor|Shri|Smt)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

export function redactClientPHI(text: string): { redactedText: string; phiFound: boolean } {
  if (!text) return { redactedText: text, phiFound: false };

  let replaced = text;
  let phiFound = false;

  const replaceWithTag = (regex: RegExp, tag: string) => {
    const after = replaced.replace(regex, tag);
    if (after !== replaced) {
      phiFound = true;
      replaced = after;
    }
  };

  replaceWithTag(EMAIL_REGEX, "<EMAIL>");
  replaceWithTag(SSN_REGEX, "<SSN>");
  replaceWithTag(PHONE_REGEX, "<PHONE>");
  replaceWithTag(AADHAAR_REGEX, "<AADHAAR>");
  replaceWithTag(ABHA_REGEX, "<ABHA>");
  replaceWithTag(IP_REGEX, "<IP_ADDRESS>");
  replaceWithTag(MRN_REGEX, "<MRN>");
  replaceWithTag(DATE_REGEX, "<DATE>");
  replaceWithTag(NAME_PREFIX_REGEX, "<NAME>");

  return { redactedText: replaced, phiFound };
}
