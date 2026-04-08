# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not open a public GitHub issue**.

Instead, report it privately via one of the following channels:

- **GitHub Private Advisory**: Open a [Security Advisory](https://github.com/Irona-ai/irona-node-sdk/security/advisories/new) directly on this repository.
- **Email**: Contact the maintainers at the email listed on the [Irona AI organization profile](https://github.com/Irona-ai).

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof of concept if possible)
- Any suggested mitigations

We will acknowledge your report within **72 hours** and aim to release a fix within **14 days** for critical issues.

## Scope

The following are in scope:

- The `ironaai` npm package source code in this repository
- Authentication and API key handling logic
- Dependency vulnerabilities with a direct exploit path

The following are out of scope:

- Vulnerabilities in third-party AI provider APIs (OpenAI, Anthropic, etc.)
- Issues already publicly known or reported
- Social engineering attacks

## Supported Versions

We actively maintain and patch the latest published version on npm. Older versions do not receive security backports.

## Disclosure Policy

We follow responsible disclosure. After a fix is released, we will publish a summary of the vulnerability and credit the reporter (unless they prefer to remain anonymous).
