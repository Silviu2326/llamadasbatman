"""Realismo opcional para las versiones "arriesgadas" del A/B de voz.

Solo stdlib a propósito: se testea en local sin GPU ni dependencias
(`python test_ambience.py`) y ambos workers lo importan como módulo hermano.
"""
from __future__ import annotations

import array
import random

# Muletillas cortas que un comercial suelta mientras "piensa"; se
# pre-sintetizan una vez por sesión y se rotan para no sonar a loop.
FILLERS = {
    "en": ["Mm-hm.", "Right.", "Okay.", "I see."],
    "es": ["Ajá.", "Entiendo.", "Claro.", "Ya veo."],
}


def filler_phrases(language: str | None) -> list[str]:
    return FILLERS["en" if str(language or "").lower().startswith("en") else "es"]


def mix_line_noise(pcm: bytes, level: float, seed: int = 0) -> bytes:
    """Mezcla ruido de línea telefónica (ruido blanco suave) sobre PCM16 mono.

    ``level`` es amplitud relativa sobre fondo de escala (0 desactiva; se
    recorta a 0.05 para que nunca tape la voz). Determinista por ``seed``.
    """
    # ponytail: el ruido suena solo mientras el agente habla — ambiente
    # continuo exigiría un stream aparte y que el cliente mezclara pistas.
    if level <= 0 or len(pcm) < 2:
        return pcm
    samples = array.array("h")
    samples.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
    amp = int(min(level, 0.05) * 32767)
    rng = random.Random(seed)
    for i in range(len(samples)):
        samples[i] = max(-32768, min(32767, samples[i] + rng.randint(-amp, amp)))
    return samples.tobytes()
