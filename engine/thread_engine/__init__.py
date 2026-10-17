"""THREAD: Traceable Health Risk Escalation & Action Detection.

The engine turns a resident's records into concern threads in four separate steps:

    normalize -> extract (notes) -> link -> decide (state machine) -> explain

Extraction may use a language model; every decision after it is deterministic.
"""

__version__ = "0.1.0"
