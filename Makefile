# THREAD developer entry points. Everything runs locally; no cloud account or API key is needed.
#
#   make setup     Python venv + web dependencies
#   make dev       API on :8000 and the web app on :3000 (Ctrl+C stops both)
#   make test      Engine and API tests, web typecheck and lint
#   make eval      Run the labelled evaluation and write data/evaluation.json

SHELL := /bin/bash
.DEFAULT_GOAL := help
PY      ?= python3.12
VENV    := .venv
BIN     := $(VENV)/bin

.PHONY: help setup api web dev test test-py test-web lint eval snapshot pages reset clean

help: ## List targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

setup: ## Create the Python venv and install web dependencies
	test -d $(VENV) || $(PY) -m venv $(VENV)
	$(BIN)/pip install -q -e '.[dev]'
	cd web && npm ci

api: ## Run the API on :8000
	$(BIN)/uvicorn thread_api.main:app --port 8000 --reload --reload-dir engine --reload-dir api

web: ## Run the web app on :3000 (proxies /api to :8000)
	cd web && npm run dev

dev: ## API and web app together
	@trap 'kill 0' EXIT; $(MAKE) -s api & $(MAKE) -s web & wait

test: test-py test-web ## All tests and static checks

test-py:
	$(BIN)/pytest
	$(BIN)/ruff check engine api

test-web:
	cd web && npm run typecheck && npm run lint

lint: ## Static checks only
	$(BIN)/ruff check engine api
	cd web && npm run lint

eval: ## Run the labelled evaluation (writes data/evaluation.json)
	$(BIN)/thread evaluate --out data/evaluation.json

snapshot: ## Export the engine's output for the static GitHub Pages build
	$(BIN)/python -m thread_api.snapshot --out web/public/snapshot

pages: snapshot ## Build the static preview into web/out
	cd web && NEXT_PUBLIC_DATA_MODE=static PAGES_BASE_PATH=/thread-pcc npm run build

reset: ## Reset the demo database to the seeded facility
	rm -f data/thread.sqlite*

clean:
	rm -rf web/.next web/out web/public/snapshot .pytest_cache
