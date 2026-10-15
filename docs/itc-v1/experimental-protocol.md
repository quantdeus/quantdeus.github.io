# ITC V1 experimental protocol — Kryon draft

Goal: evaluate whether independent annotators reproducibly identify target patterns rather than simply perceive phrases in ambiguous sounds. This does not establish any paranormal source.

1. Pre-register hypothesis and exact primary metric (e.g. word accuracy against known injected synthetic speech, false positives on noise-only controls).
2. Q generates 20 labelled test segments and 20 matched control segments using unique, disclosed-after-unblinding seeds. Equalize duration and output level.
3. Randomize order and conceal ground-truth labels from participants and the analyst, including Kryon, during annotation.
4. Collect first-pass verbatim transcription and confidence *before* showing any suggestion or other participant's answers.
5. Lock submissions, reveal labels, compute accuracy / false positives / inter-rater agreement, and archive both successful and failed observations.
6. Label every interpretation as "observation", "hypothesis", or "verified from reference". Do not treat a speech recognition model's hallucination as source authentication.
7. Allow people to propose charitable or creative tasks inspired by themes. These are voluntary human-authored projects, never obligatory commands supposedly originating from audio.
8. Data/Tuvok audit provenance, sample selection, device artifacts, and reproducibility. Human owner authorizes publication.

Minimum annotation fields:
\`schemaVersion,runId,segmentStartMs,segmentEndMs,annotatorPseudonym,transcriptGuess,confidence,blindFlag,unblindedAt\`.

Privacy: no recordings of people without explicit consent. Remove identifiable speech before any public release. Raw recordings remain local/private by default.
