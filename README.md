# wpm

**Modern Package Management for the WordPress Ecosystem.**

`wpm` is a fast, secure, and globally distributed package registry built specifically for WordPress plugins and themes. It enables developers to discover, install, publish, and manage both public and private packages with robust supply-chain security.

This repository contains the **Registry Backend** and the **Web Application** (wpm.so) that power the ecosystem.

_(Note: The `wpm` CLI tool is built in Go and maintained in a separate repository.)_

## ✨ Features

- 🌍 **Globally Distributed Registry**: Powered by Cloudflare Workers, delivering packages with edge-latency across the globe.
- 🔒 **Supply-Chain Security**: End-to-end verifiable artifacts, provenance support, and secure package signing.
- 🏢 **Public & Private Packages**: Seamlessly manage open-source plugins or secure your agency's private themes behind RBAC and scoped tokens.
- ⚡ **Lightning Fast Search**: Full-text search (FTS5) backed by Cloudflare D1 and BM25 ranking.
- 🛡️ **Advanced Access Control**: Granular permissions (Admin, Maintainer, Viewer), token scoping, and IP CIDR restrictions.
- 🖥️ **Modern Web App**: Server-rendered Hono application with Island-based web components, HTMX, and Tailwind CSS v4.

## 🏗️ Architecture & Tech Stack

This project is a monorepo managed with **Bun Workspaces**.

### Core Technologies

- **Runtime/Tooling:** [Bun](https://bun.sh), [Vite+](https://viteplus.dev/), TypeScript
- **Infrastructure:** Cloudflare Workers
- **Database:** PostgreSQL (via Cloudflare Hyperdrive) + Cloudflare D1 (for Edge Search)
- **Caching & Storage:** Cloudflare KV, Cloudflare R2 / AWS S3
- **Frontend:** [Hono](https://hono.dev/) (JSX & SSR), [HTMX](https://htmx.org/), [Tailwind CSS v4](https://tailwindcss.com/), Native Web Components (Islands)
- **Authentication:** [Clerk](https://clerk.com/)

### Workspace Structure

- **`web/`**: The frontend web application (wpm.so). Handles search, package discovery, documentation, and user dashboard.
- **`registry/`**: The registry API (registry.wpm.so). Used by the `wpm` CLI to publish, fetch, and verify packages.
- **`packages/`**: Shared internal libraries:
  - `@wpm/auth`: Token generation, validation, and HMAC hashing.
  - `@wpm/db`: PostgreSQL database access layer and queries.
  - `@wpm/d1`: Cloudflare D1 integration for fast package searching.
  - `@wpm/manifest`: Zod schemas and validation for `wpm` package manifests.
  - `@wpm/net`: Network utilities (CIDR validation, IP normalization).
  - `@wpm/rbac`: Role-Based Access Control logic.
  - `@wpm/storage`: AWS S3 / R2 presigned URL generation.
  - `@wpm/types`: Shared TypeScript types and enums.

## 🚀 Local Development

### Prerequisites

- [Bun](https://bun.sh/) (v1.3+)
- [Docker](https://www.docker.com/) & Docker Compose (for local Postgres & LocalStack)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`bun i -g wrangler`)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/trywpm/registry.git
cd registry
bun install
```

### 2. Environment Setup

Spin up the local infrastructure (PostgreSQL & LocalStack for S3/Email):

```bash
make docker-up
```

Run the local environment setup script to prepare your `.env` files and bindings:

```bash
make env-setup
```

Apply database migrations:

```bash
make migrate-up
```

### 3. Running the Apps

You can start both the Web App and the Registry in parallel using the Makefile:

```bash
make start
```

- **Web App** will be available at `http://localhost:3000`
- **Registry API** will be available at `http://localhost:3001`

If you want to run them individually:

```bash
make start-web       # Starts only the web app
make start-registry  # Starts only the registry api
```

## 🛠️ Useful Commands

This project uses a `Makefile` to simplify common development tasks.

| Command               | Description                                       |
| :-------------------- | :------------------------------------------------ |
| `make start`          | Start both Web and Registry in parallel           |
| `make prestart`       | Boot Docker containers and run env setup          |
| `make build`          | Build the project for production                  |
| `make test`           | Run the Vitest test suites across all packages    |
| `make check`          | Run Oxlint, formatters, and type checking         |
| `make lint`           | Run the linter (`vp lint`)                        |
| `make format`         | Format codebase (`vp fmt`)                        |
| `make migrate-create` | Create a new sequenced SQL migration              |
| `make migrate-up`     | Apply pending database migrations                 |
| `make docker-up`      | Boot local Postgres and LocalStack                |
| `make clean`          | Tear down containers, volumes, and remove orphans |

## 📦 Creating Migrations

To create a new database migration:

```bash
make migrate-create
# Prompt: Enter migration name: add_users_table
```

This will generate a `.up.sql` and `.down.sql` file in the `migrations/` directory.

## 🔐 Authentication & Security

- **Web Auth**: User authentication is managed by [Clerk](https://clerk.com/).
- **CLI Auth**: Personal Access Tokens (PATs) are used by the CLI to talk to the registry. Tokens are HMAC-SHA256 hashed before being stored in the database.
- **Storage**: Artifacts (`.tar.zst`) are securely served. Private packages are gated via short-lived, presigned S3 URLs generated at the edge.

---

_Built with ❤️ for WordPress._
