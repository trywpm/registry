# wpm

WordPress never got a package manager the way Node has npm. You install plugins and themes by hand, or you bolt together Composer and a pile of glue. wpm is the thing that should have existed years ago: a real registry, with versions, private packages, and a CLI that just works.

It's running at [wpm.so](https://wpm.so) today. This repo is the backend and the website. The CLI is a separate Go project in its own repo.

## What's here

Two Workers and the code they share.

`registry/` is the API at registry.wpm.so, the thing the CLI hits when you publish or install.

`web/` is the website at wpm.so: search, package pages, docs, your dashboard.

`packages/` is the shared code both Workers pull from: auth and token hashing, the Postgres layer, D1 search, manifest validation, S3 and KMS signing, rbac, CIDR/IP, semver, and a few odds and ends.

## How it works

It all runs on Cloudflare Workers, so there's no server to babysit. Most of the work is in running stateful things from a stateless edge.

Postgres is the source of truth. Workers reach it through Hyperdrive, which keeps a warm pool of connections at the edge so you're not paying for a fresh database handshake on every request.

Search runs somewhere else entirely. It lives in a D1 database (SQLite, with FTS5 and BM25 ranking) that we sync from Postgres, so a search query is answered right at the edge and never touches the primary.

Publishing is the one place we're strict about ordering. Every publish for a package goes through a single Durable Object, so two people pushing the same package at once can't step on each other. The writes happen in a deliberate order: the tarball lands in storage first, the database row commits last. If a publish dies halfway, the worst you get is a tarball with no row pointing at it, and a sweep cleans those up. What you never get is a row pointing at a tarball that isn't there. Uploads stream the whole way, too. We read the manifest off the front of the request and pipe the tarball straight to storage instead of holding it in memory.

Signing runs through AWS KMS. Before signing a manifest we canonicalize it with JCS (RFC 8785), which sounds fussy but earns its keep: the Go CLI and this TypeScript backend turn the same manifest into the same bytes, so a signature made by one verifies with the other. No "works on my machine" for signatures.

The rest, quickly. Tarballs and rendered READMEs live in R2/S3; public ones are served directly, private ones only ever as short-lived presigned URLs. Web sign-in is Clerk. CLI auth is personal access tokens, hashed with HMAC-SHA256 before they ever reach the database, so a leaked dump is useless. Tokens can be scoped and locked to IP ranges. The site is server-rendered with Hono and stays mostly plain HTML, with some HTMX and a few hand-written web components for the bits that actually need to be interactive.

## Running it locally

You'll need Node 26, pnpm (run `corepack enable`), Docker, and golang-migrate's `migrate` on your PATH. One catch: the local S3, KMS, and SES services run on LocalStack Pro, so you'll need a `LOCALSTACK_AUTH_TOKEN` in your environment.

```bash
git clone https://github.com/trywpm/registry-v3.git
cd registry-v3
pnpm install
make start
```

The first `make start` sets everything up for you: writes the `.env` files, boots Docker, creates the bucket, KMS key, and database, runs migrations, then starts both Workers. Web comes up on :3000, registry on :3001. After that it just starts them.

The rest is make targets. `make test` runs the tests, `make check` does lint and types, `make build` builds for production, `make migrate-create` scaffolds a migration. `make help` lists everything.

## License

MIT. See [LICENSE](LICENSE).
