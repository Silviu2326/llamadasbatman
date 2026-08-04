"""Similitud de locutor (ECAPA-TDNN) entre los clips originales de Carlos y los clonados.

Baseline = original vs original (dos grabaciones reales del mismo Carlos). Es el techo:
si el clon puntua cerca de ese numero, es tan parecido como dos audios suyos entre si.
"""
from itertools import combinations
from pathlib import Path

import torch
import torchaudio
from speechbrain.inference.speaker import EncoderClassifier

HERE = Path(__file__).parent
enc = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb", savedir=str(HERE / ".ecapa")
)


def emb(path):
    wav, sr = torchaudio.load(str(path))
    if sr != 16000:
        wav = torchaudio.functional.resample(wav, sr, 16000)
    return enc.encode_batch(wav).squeeze()


refs = {p.stem[-5:]: emb(p) for p in sorted((HERE / "ref").glob("*.wav"))}
import sys

folder = sys.argv[1] if len(sys.argv) > 1 else "out"
outs = {p.stem[-5:]: emb(p) for p in sorted((HERE / folder).glob("*.wav"))}
cos = torch.nn.CosineSimilarity(dim=0)

base = [cos(refs[a], refs[b]).item() for a, b in combinations(refs, 2)]
print(f"baseline original-vs-original: {sum(base)/len(base):.3f}  ({[f'{b:.3f}' for b in base]})")
for k, e in outs.items():
    scores = [cos(e, r).item() for r in refs.values()]
    print(f"clon {k}: media {sum(scores)/len(scores):.3f}  vs cada original {[f'{s:.3f}' for s in scores]}")
