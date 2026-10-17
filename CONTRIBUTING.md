# Contributing

Thanks for helping improve this local development stack. Bug reports, documentation fixes, configuration improvements, and carefully tested service additions are welcome.

## Before You Start

- Check existing issues and pull requests to avoid duplicating work.
- For a significant change, open an issue or discussion first to describe the proposal.
- Keep changes focused and update the README when setup, ports, services, or behavior changes.
- Do not include credentials, `.env` files, database contents, audit logs, or other local runtime data in a commit.

## Development Setup

Install Docker Desktop with Docker Compose v2. For the full stack, allocate at least 16 GB of memory to Docker and make sure the required host ports are available.

From the repository root, copy `.env.example` to `.env`, set `DATA_DIR` to an absolute path on your machine, and replace the sample `DEV_PASS`. The `.env` file is local and must not be committed.

The Compose file uses an external network. Create it once if it does not already exist:

```powershell
docker network inspect dev-network *> $null
if ($LASTEXITCODE -ne 0) { docker network create dev-network }
```

Start the stack with:

```powershell
docker compose -f local-containers.yml up -d
```

## Making a Change

1. Fork the repository and clone your fork.
2. Create a branch for your change, for example `feature/add-service` or `fix/collector-config`.
3. Make the smallest focused change that addresses the issue.
4. Update documentation and example configuration where appropriate.
5. Validate the affected Compose and service configuration before opening a pull request.

For service additions, follow the existing Compose patterns. Use `${DATA_DIR}` for persistent local data, add required environment variables to `.env.example` with safe example values, document ports and setup, and avoid host-port conflicts where possible.

## Validation

At minimum, validate Compose syntax and interpolation:

```powershell
docker compose -f local-containers.yml config --quiet
```

For OpenTelemetry Collector changes, validate its configuration:

```powershell
docker compose -f local-containers.yml run --rm --no-deps --entrypoint /otelcol-contrib otel-collector validate --config=/etc/otel-collector-config.yaml
```

For Grafana dashboard JSON, parse the file as JSON and confirm every panel references a provisioned data source and uses valid queries. If practical, start the affected services and verify their health and behavior in Grafana, Loki, Prometheus, or Jaeger.

Do not run cleanup commands that delete persisted data as part of routine validation. `docker compose down` stops the stack while preserving the bind-mounted data; avoid `docker compose down -v` and deleting anything under `DATA_DIR` unless you explicitly intend to remove that data.

## Security and Data Handling

This repository is intended for local development, not production deployment. Database activity logging can capture SQL statements, Redis commands, and sensitive values. Treat generated audit files and Loki data as sensitive, keep them out of Git, and avoid adding real credentials or customer data to examples, screenshots, issues, or pull requests.

Do not expose Docker socket access, database ports, Grafana, or Loki to untrusted networks as part of a contribution without clearly documenting the security implications.

## Pull Requests

Open a pull request against the default branch and include:

- A concise summary of the problem and the change.
- The services, ports, configuration, and persistent paths affected.
- Validation performed and any checks you could not run.
- Relevant screenshots for dashboard or UI changes, with secrets and sensitive data removed.
- Any tradeoffs, known limitations, resource costs, or security implications.

Keep the pull request focused and be responsive to review feedback. Maintainers may request changes before merging.
