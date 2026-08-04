"""Tests locales (sin GPU ni deps) del módulo de realismo: python test_ambience.py"""
from __future__ import annotations

import struct
import unittest

from ambience import filler_phrases, mix_line_noise


class AmbienceTest(unittest.TestCase):
    def test_level_zero_is_identity(self) -> None:
        pcm = struct.pack("<4h", 0, 1000, -1000, 32767)
        self.assertEqual(mix_line_noise(pcm, 0.0), pcm)

    def test_noise_changes_audio_but_keeps_size_and_range(self) -> None:
        pcm = struct.pack("<480h", *([0] * 480))
        mixed = mix_line_noise(pcm, 0.01, seed=7)
        self.assertEqual(len(mixed), len(pcm))
        self.assertNotEqual(mixed, pcm)
        values = struct.unpack("<480h", mixed)
        self.assertTrue(all(-32768 <= v <= 32767 for v in values))
        self.assertTrue(max(abs(v) for v in values) <= int(0.05 * 32767))

    def test_deterministic_per_seed(self) -> None:
        pcm = struct.pack("<100h", *([500] * 100))
        self.assertEqual(mix_line_noise(pcm, 0.01, seed=3), mix_line_noise(pcm, 0.01, seed=3))
        self.assertNotEqual(mix_line_noise(pcm, 0.01, seed=3), mix_line_noise(pcm, 0.01, seed=4))

    def test_clipping_saturates_instead_of_wrapping(self) -> None:
        pcm = struct.pack("<100h", *([32767] * 100))
        values = struct.unpack("<100h", mix_line_noise(pcm, 0.05, seed=1))
        self.assertTrue(all(v > 30000 for v in values))

    def test_fillers_by_language(self) -> None:
        self.assertIn("Mm-hm.", filler_phrases("en-US"))
        self.assertIn("Ajá.", filler_phrases("es-ES"))
        self.assertIn("Ajá.", filler_phrases(None))


if __name__ == "__main__":
    unittest.main()
