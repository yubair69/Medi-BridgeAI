"""Real TTS provider: facebook/mms-tts-eng via transformers (VITS), local/
self-hosted -- reuses the torch/transformers stack already required for
NLLB MT rather than adding a separate TTS dependency family.

Import of transformers/torch/numpy is deferred into __init__/synthesize, same
pattern as the ASR/MT real providers, so importing this module never requires
the heavy optional dependency to be installed.
"""

from __future__ import annotations

import base64

from app.tts.provider import TTSProvider
from app.tts.schemas import TTSAudioSegment


LANGUAGE_MODELS: dict[str, str] = {
    "en": "facebook/mms-tts-eng",
    "hi": "facebook/mms-tts-hin",
}


class MmsTTSProvider(TTSProvider):
    def __init__(self, model_name: str | None = None) -> None:
        try:
            from transformers import AutoTokenizer, VitsModel  # noqa: F401
        except ImportError as exc:  # pragma: no cover - exercised only when the
            # optional heavy dependency isn't installed.
            raise RuntimeError(
                "transformers/torch are not installed. Install "
                "services/speech-pipeline/requirements-mt.txt to use the real "
                "TTS provider; otherwise use FixtureTTSProvider for tests."
            ) from exc

        import torch

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._default_model_name = model_name
        self._models: dict[str, tuple[object, object, int]] = {}

    def _get_model_assets(self, language: str) -> tuple[object, object, int]:
        from transformers import AutoTokenizer, VitsModel

        lang_key = "hi" if language.lower().startswith("hi") or language == "hin" else "en"
        if lang_key in self._models:
            return self._models[lang_key]

        target_model = self._default_model_name or LANGUAGE_MODELS.get(lang_key, "facebook/mms-tts-eng")
        try:
            tokenizer = AutoTokenizer.from_pretrained(target_model)
            model = VitsModel.from_pretrained(target_model).to(self._device)
        except Exception:
            # Fallback to english checkpoint if language-specific model fails to load
            target_model = "facebook/mms-tts-eng"
            tokenizer = AutoTokenizer.from_pretrained(target_model)
            model = VitsModel.from_pretrained(target_model).to(self._device)

        sample_rate: int = getattr(model.config, "sampling_rate", 16000)
        self._models[lang_key] = (tokenizer, model, sample_rate)
        return tokenizer, model, sample_rate

    def prewarm(self, languages: list[str] | None = None) -> None:
        langs = languages or ["en"]
        for lang in langs:
            try:
                self._get_model_assets(lang)
            except Exception:
                pass


    def synthesize(self, text: str, language: str) -> TTSAudioSegment:
        import numpy as np
        import torch

        try:
            tokenizer, model, sample_rate = self._get_model_assets(language)

            clean_text = text.strip() if text else ""
            if not clean_text:
                silence = np.zeros(int(sample_rate * 0.2), dtype=np.int16).tobytes()
                return TTSAudioSegment(
                    audio_base64=base64.b64encode(silence).decode("ascii"),
                    sample_rate=sample_rate,
                    format="pcm16",
                )

            inputs = tokenizer(clean_text, return_tensors="pt").to(self._device)

            # Guard against zero-token inputs which cause torch.narrow() to fail
            if inputs.input_ids is None or inputs.input_ids.shape[-1] == 0:
                silence = np.zeros(int(sample_rate * 0.2), dtype=np.int16).tobytes()
                return TTSAudioSegment(
                    audio_base64=base64.b64encode(silence).decode("ascii"),
                    sample_rate=sample_rate,
                    format="pcm16",
                )

            with torch.no_grad():
                output = model(**inputs).waveform

            waveform = output.squeeze().detach().cpu().numpy()
            clamped = np.clip(waveform, -1.0, 1.0)
            pcm16 = (clamped * 32767).astype(np.int16).tobytes()

            return TTSAudioSegment(
                audio_base64=base64.b64encode(pcm16).decode("ascii"),
                sample_rate=sample_rate,
                format="pcm16",
            )
        except Exception:
            sample_rate = 16000
            silence = np.zeros(int(sample_rate * 0.2), dtype=np.int16).tobytes()
            return TTSAudioSegment(
                audio_base64=base64.b64encode(silence).decode("ascii"),
                sample_rate=sample_rate,
                format="pcm16",
            )

