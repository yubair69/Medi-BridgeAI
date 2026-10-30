"""Real MT provider: NLLB-200-distilled-600M via HuggingFace transformers,
chosen for Phase 2 per the decision recorded in docs/PROGRESS.md -- local/
self-hosted so no third-party retains transcript text (Blueprint Section 6.1).

Import of transformers/torch is deferred into __init__, same pattern as
app.asr.faster_whisper_provider, so importing this module never requires the
heavy optional dependency to be installed.
"""

from __future__ import annotations

from app.mt.provider import MTProvider
from app.mt.schemas import TranslationSegment

# NLLB uses FLORES-200 codes, not ISO 639-1 -- e.g. "hin_Deva", "eng_Latn".
_LANGUAGE_CODE_MAP = {
    "hi": "hin_Deva",
    "en": "eng_Latn",
}


def _resolve_code(lang: str) -> str:
    return _LANGUAGE_CODE_MAP.get(lang, lang)


class NLLBTranslationProvider(MTProvider):
    def __init__(self, model_name: str = "facebook/nllb-200-distilled-600M") -> None:
        try:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        except ImportError as exc:  # pragma: no cover - exercised only when the
            # optional heavy dependency isn't installed.
            raise RuntimeError(
                "transformers/torch are not installed. Install "
                "services/speech-pipeline/requirements-mt.txt to use the real "
                "MT provider; otherwise use FixtureMTProvider for tests."
            ) from exc

        import torch

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._dtype = torch.float16 if self._device.type == "cuda" else torch.float32
        self._tokenizer = AutoTokenizer.from_pretrained(model_name)
        self._model = AutoModelForSeq2SeqLM.from_pretrained(
            model_name,
            dtype=self._dtype,
            device_map={"": self._device},
        )
        self._model.eval()

    def translate(self, text: str, source_lang: str, target_lang: str) -> TranslationSegment:
        import torch

        if source_lang == target_lang:
            return TranslationSegment(
                text=text.strip(),
                source_language=source_lang,
                target_language=target_lang,
            )

        src_code = _resolve_code(source_lang)
        tgt_code = _resolve_code(target_lang)

        self._tokenizer.src_lang = src_code
        inputs = self._tokenizer(text, return_tensors="pt").to(self._device)
        forced_bos_token_id = self._tokenizer.convert_tokens_to_ids(tgt_code)
        with torch.inference_mode():
            generated = self._model.generate(
                **inputs,
                forced_bos_token_id=forced_bos_token_id,
                max_new_tokens=256,
            )
        translated_text = self._tokenizer.batch_decode(generated, skip_special_tokens=True)[0]

        return TranslationSegment(
            text=translated_text.strip(),
            source_language=source_lang,
            target_language=target_lang,
        )
