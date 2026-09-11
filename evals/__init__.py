"""Tier 7: the evals.

Unit tests pin examples. These measure properties across many cases, and each
one is aimed at a claim the product makes out loud:

  fairness     the fairness invariant holds across generated circles, whatever
               the model proposes (evals.fairness)
  privacy      no private fact crosses the wire, under adversarial attack,
               framed after MAGPIE (evals.privacy)
  escalation   the agent asks exactly when a decision is the family's:
               precision and recall on labelled scenarios (evals.escalation)
  precedent    the family is asked less, month over month, and only because
               of what they decided (evals.precedent)

    python -m evals                      all four, offline, prints a scorecard
    python -m evals --n 200              more generated circles
    python -m evals --write-fixtures     also writes fixtures/evals.json

No AWS is needed. Every node, hook, store and ledger entry is the real code;
where a model would be called, a scripted one stands in, and in the fairness and
privacy evals the stand-in is deliberately hostile.
"""
