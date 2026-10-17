# Security Policy

## Supported Versions

This repository is a local development stack. Security fixes are considered for the current contents of the default branch. No release or backport support window is currently defined.

The containers include third-party images and tools. Each upstream project controls security fixes for its own software; this repository does not provide a separate support commitment for upstream components.

## Reporting a Vulnerability

Please do not report suspected vulnerabilities in a public issue, discussion, or pull request.

Use GitHub's **Report a vulnerability** option on the repository's Security tab to send a private report, if private vulnerability reporting is enabled. If that option is unavailable, contact the repository maintainer through the contact method listed on the maintainer's GitHub profile. Include enough detail to reproduce the issue, the affected file or service, and potential impact. Do not include live credentials, personal data, or production secrets in the report.

The maintainer will review reports and may ask for additional information. There is no guaranteed response or resolution timeline. Please allow time for assessment and remediation before publicly disclosing an unpatched issue.

## Deployment and Data Notes

This project is intended for local development and is not a production-hardened deployment. In particular:

- Do not expose the stack's database, emulator, Grafana, Loki, or management ports to untrusted networks.
- Replace sample credentials and protect the local `.env` file.
- LocalStack is given access to the Docker socket; Docker socket access can grant broad control over the Docker host.
- Database statement and command logging can record sensitive values. Protect audit files and Loki data, and disable activity logging when it is not needed.
- Keep Docker images and dependencies updated, and review upstream security guidance for the components you use.
