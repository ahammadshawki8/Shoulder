.PHONY: install demo dry test clean

install:
	python -m venv .venv
	.venv/Scripts/pip install -e ".[dev]"

dry:
	.venv/Scripts/python -m shoulder.cli --dry

demo:
	.venv/Scripts/python -m shoulder.cli

test:
	.venv/Scripts/python -m pytest

clean:
	rm -rf .pytest_cache __pycache__ .shoulder