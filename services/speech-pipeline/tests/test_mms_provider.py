import base64
import sys
from unittest.mock import MagicMock


def test_mms_provider_empty_input_returns_silence() -> None:
    mock_transformers = MagicMock()
    mock_torch = MagicMock()
    mock_torch.device.return_value = "cpu"

    mock_vits_cls = MagicMock()
    mock_model = MagicMock()
    mock_model.config.sampling_rate = 16_000
    mock_vits_cls.from_pretrained.return_value.to.return_value = mock_model
    mock_transformers.VitsModel = mock_vits_cls

    mock_tok_cls = MagicMock()
    mock_transformers.AutoTokenizer = mock_tok_cls

    orig_tf = sys.modules.get("transformers")
    orig_torch = sys.modules.get("torch")
    sys.modules["transformers"] = mock_transformers
    sys.modules["torch"] = mock_torch

    try:
        from app.tts.mms_provider import MmsTTSProvider

        provider = MmsTTSProvider()
        # Empty string
        res = provider.synthesize("", "hi")
        assert res.sample_rate == 16_000
        assert res.format == "pcm16"
        audio = base64.b64decode(res.audio_base64)
        assert len(audio) == int(16_000 * 0.2 * 2)  # 200ms of 16-bit PCM
    finally:
        if orig_tf is not None:
            sys.modules["transformers"] = orig_tf
        else:
            sys.modules.pop("transformers", None)
        if orig_torch is not None:
            sys.modules["torch"] = orig_torch
        else:
            sys.modules.pop("torch", None)


def test_mms_provider_zero_tokens_returns_silence_without_calling_model() -> None:
    mock_transformers = MagicMock()
    mock_torch = MagicMock()
    mock_torch.device.return_value = "cpu"

    mock_vits_cls = MagicMock()
    mock_model = MagicMock()
    mock_model.config.sampling_rate = 16_000
    mock_vits_cls.from_pretrained.return_value.to.return_value = mock_model
    mock_transformers.VitsModel = mock_vits_cls

    mock_tok_cls = MagicMock()
    mock_tokenizer = MagicMock()
    empty_tensor = MagicMock()
    empty_tensor.shape = [1, 0]  # zero tokens
    mock_tokenizer.return_value.to.return_value = MagicMock(input_ids=empty_tensor)
    mock_tok_cls.from_pretrained.return_value = mock_tokenizer
    mock_transformers.AutoTokenizer = mock_tok_cls

    orig_tf = sys.modules.get("transformers")
    orig_torch = sys.modules.get("torch")
    sys.modules["transformers"] = mock_transformers
    sys.modules["torch"] = mock_torch

    try:
        from app.tts.mms_provider import MmsTTSProvider

        provider = MmsTTSProvider()
        res = provider.synthesize("non-tokenizable text", "hi")
        # Ensure model forward pass was NOT called (which would have caused narrow error)
        mock_model.assert_not_called()
        assert res.sample_rate == 16_000
        audio = base64.b64decode(res.audio_base64)
        assert len(audio) > 0
    finally:
        if orig_tf is not None:
            sys.modules["transformers"] = orig_tf
        else:
            sys.modules.pop("transformers", None)
        if orig_torch is not None:
            sys.modules["torch"] = orig_torch
        else:
            sys.modules.pop("torch", None)
