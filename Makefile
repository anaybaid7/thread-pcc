# THREAD · Off Day or Something More?
# Needs Node 22+. No database server or API key required: without DATABASE_URL the API uses an embedded
# PostgreSQL (PGlite) in .data/, and without GEMINI_API_KEY handover drafts use the standard template.

.PHONY: setup dev api web test typecheck lint build pages migrate seed reset e2e

setup:            ## install dependencies for all workspaces
	npm install

dev:              ## API on :8000 and the app on http://localhost:3000
	@trap 'kill 0' INT TERM; npm run dev -w server & npm run dev -w web & wait

api:
	npm run dev -w server

web:
	npm run dev -w web

test:             ## engine and server tests
	npm test

typecheck:
	npm run typecheck

lint:
	npm run lint

build:            ## production build of the web app (talks to the API)
	npm run build

pages:            ## static practice-mode build, as deployed to GitHub Pages
	cd web && NEXT_PUBLIC_DATA_MODE=static PAGES_BASE_PATH=/thread-pcc npx next build

migrate:          ## apply database migrations (DATABASE_URL or the embedded database)
	npm run migrate -w server

seed:             ## migrations plus scenario seed data
	npm run seed -w server

reset:            ## delete the embedded development database
	rm -rf .data

e2e:              ## build both web modes, then play the game in Chromium (saved, practice, phone)
	npm run build:e2e
	npm run e2e
