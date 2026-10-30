"""Real speaker-embedding provider: SpeechBrain ECAPA-TDNN
(speechbrain/spkrec-ecapa-voxceleb), local/self-hosted, ungated on
HuggingFace (unlike pyannote.audio's diarization pipeline).

Import of speechbrain/torch/numpy is deferred into __init__/embed, same
pattern as the other real providers, so importing this module never requires
the heavy optional dependency to be installed.

Uses LocalStrategy.COPY_SKIP_CACHE rather than speechbrain's SYMLINK default:
symlinking the HF cache into savedir needs elevated privileges on Windows
(verified in this environment -- SYMLINK raised WinError 1314), and copying
avoids that without meaningfully changing behavior for a single-model-source
service like this one.
"""

from __future__ import annotations

from app.diarization.provider import SpeakerEmbeddingProvider


class EcapaEmbeddingProvider(SpeakerEmbeddingProvider):
    def __init__(
        self,
        source: str = "speechbrain/spkrec-ecapa-voxceleb",
        savedir: str = "pretrained_models/spkrec-ecapa-voxceleb",
    ) -> None:
        try:
            from speechbrain.inference.speaker import EncoderClassifier
            from speechbrain.utils.fetching import LocalStrategy
        except ImportError as exc:  # pragma: no cover - exercised only when the
            # optional heavy dependency isn't installed.
            raise RuntimeError(
                "speechbrain/torch are not installed. Install "
                "services/speech-pipeline/requirements-diarization.txt to use "
                "the real embedding provider; otherwise use "
                "FixtureEmbeddingProvider for tests."
            ) from exc

        self._classifier = EncoderClassifier.from_hparams(
            source=source,
            savedir=savedir,
            local_strategy=LocalStrategy.COPY_SKIP_CACHE,
        )

    def embed(self, pcm16_mono: bytes, sample_rate: int) -> list[float]:
        import numpy as np
        import torch

        samples = np.frombuffer(pcm16_mono, dtype=np.int16).astype(np.float32) / 32768.0
        # ECAPA-TDNN needs ≥ ~0.2 s; pad short chunks to avoid padding > dim error
        min_samples = max(int(sample_rate * 0.2), 3200)
        if len(samples) < min_samples:
            samples = np.pad(samples, (0, min_samples - len(samples)))
        waveform = torch.from_numpy(samples).unsqueeze(0)
        embedding = self._classifier.encode_batch(waveform)
        return embedding.squeeze().detach().cpu().numpy().tolist()  # type: ignore[no-any-return]
