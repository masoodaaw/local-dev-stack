# Accessibility

We want this project and its documentation to be usable by as many people as possible. Accessibility feedback and improvements are welcome.

## Scope

This repository provides Docker Compose configuration, documentation, and provisioning files for local development services. The project does not currently claim conformance with a particular accessibility standard, and no formal accessibility audit has been completed.

Grafana, Jaeger, pgAdmin, Kafka UI, and the other bundled service interfaces are maintained by their respective upstream projects. Their accessibility behavior may vary by service and version; please report interface-specific issues to the appropriate upstream project as well as noting any configuration or integration issue here.

## Reporting an Accessibility Issue

Open an issue in the [GitHub issue tracker](https://github.com/masoodaaw/local-dev-stack/issues) with:

- The affected file, documentation section, dashboard, or service.
- What you expected to happen and what happened instead.
- Steps to reproduce the issue, if applicable.
- Your operating system, browser, and assistive technology, if relevant.

Please do not include passwords, personal data, or other sensitive information in an issue. If an accessibility report also reveals a security vulnerability, follow the private reporting instructions in [SECURITY.md](SECURITY.md) instead of posting it publicly.

## Contribution Guidance

When contributing, prefer clear headings, descriptive link text, readable contrast, keyboard-operable controls, and meaningful text alternatives for informative images. For Grafana dashboards, use descriptive panel titles and legends, and do not rely on color alone to communicate distinctions.
