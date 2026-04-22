.PHONY: s sw sr du dd c prestart help migrate-create migrate-up migrate-down env-setup

SHELL := /usr/bin/env bash
MIGRATE_CMD := migrate -database "$(DATABASE_URL)" -path migrations

start: prestart ## Start both Web and Registry in parallel
	@$(MAKE) -j2 sw sr

sw start-web: ## Start the web worker
	vp run web#start

sr start-registry: ## Start the registry worker
	vp run registry#start

prestart: ## Prepare infrastructure and environment
	@$(MAKE) du
	@$(MAKE) env-setup

# --- Infrastructure ---

du docker-up: ## Boot docker containers in background
	@docker compose up -d

dd docker-down: ## Tear down docker containers
	@docker compose down

env-setup: ## Run local environment configuration
	@bash bin/env-setup.sh

# --- Database ---

migrate-create: ## Create a new sequenced SQL migration
	@read -p "Enter migration name: " name; \
	migrate create -ext sql -dir migrations -seq $$name

migrate-up: ## Apply all 'up' migrations
	@$(MIGRATE_CMD) up

migrate-down: ## Rollback the last migration
	@$(MIGRATE_CMD) down 1

# --- Cleanup ---

c clean: ## Remove containers, volumes, and orphans
	@docker compose down --volumes --remove-orphans

help: ## Show this help message
	@echo "Usage: make [command]"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
