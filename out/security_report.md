# Security Audit Report — irona-node-sdk

**Date:** 2026-04-08  
**Auditor:** Claude Code (automated senior security engineer pass)  
**Scope:** Full repository scan — `src/`, `example/`, `.github/`, root config files, `engineering-docs/`, `tests/`  
**Status after remediation:** All fixable issues resolved. 3 non-fixable dev-only CVEs documented.

---

## FINDINGS

---

### FINDING 1

- **File:** `example/testWithRealAPI.js`
- **Lines:** 15, 41
- **Severity:** CRITICAL
- **Status:** FIXED
- **Issue:** Two hardcoded IronaAI API key fallbacks: `'sk_4E61QXK1N7eKCfTHZ4J-yyGXWWeug7Ji'`. Used as `process.env.IRONAAI_API_KEY || '<hardcoded>'`, meaning the key is active any time the env var is unset. If committed to a public repo, this key is immediately exposed to all users and scrapers.
- **Fix Applied:** Removed the hardcoded fallback. Now reads `process.env.IRONAAI_API_KEY` only. Added comment `// Moved to environment variable for security`.
- **Remaining Action Required:** **Rotate `sk_4E61QXK1N7eKCfTHZ4J-yyGXWWeug7Ji` immediately** — it exists in git history. Run `git log --all -p | grep sk_4E61` to confirm scope. Use BFG Repo Cleaner or `git filter-repo` before making the repository public.

---

### FINDING 2

- **File:** `example/testOpenRouterGateway.js`
- **Line:** 13
- **Severity:** CRITICAL
- **Status:** FIXED
- **Issue:** Hardcoded OpenRouter API key: `'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'`. Fully live key committed directly in source — not even guarded by an env fallback pattern.
- **Fix Applied:** Replaced with `process.env.OPENROUTER_API_KEY` only.
- **Remaining Action Required:** **Rotate this OpenRouter key immediately** — it is in git history.

---

### FINDING 3

- **File:** `example/testOpenRouterGateway.js`
- **Line:** 16
- **Severity:** CRITICAL
- **Status:** FIXED
- **Issue:** Same hardcoded IronaAI key as Finding 1: `'sk_4E61QXK1N7eKCfTHZ4J-yyGXWWeug7Ji'`.
- **Fix Applied:** Same as Finding 1.
- **Remaining Action Required:** Same rotation required.

---

### FINDING 4

- **File:** `node_modules/axios` (direct production dependency)
- **Severity:** HIGH
- **Status:** FIXED via `npm audit fix`
- **CVE:** GHSA-43fc-jf86-j433
- **Issue:** Axios `>=1.0.0 <=1.13.4` — DoS via `__proto__` key in `mergeConfig`. A crafted request config could cause uncontrolled resource consumption (CVSS 7.5). This is a **direct production dependency** bundled into the published npm package.
- **Fix Applied:** `npm audit fix` updated axios to a patched version.

---

### FINDING 5

- **File:** `node_modules/ai` (direct production dependency)
- **Severity:** LOW
- **Status:** FIXED via `npm audit fix`
- **CVE:** GHSA-rwvc-j5jr-mgvh
- **Issue:** Vercel AI SDK `<5.0.52` — file type whitelist bypass when uploading files (CVSS 3.7). The SDK's MIME-type validation can be circumvented, allowing unexpected file types to be processed.
- **Fix Applied:** `npm audit fix` updated `ai` to `>=5.0.52`.

---

### FINDING 6

- **File:** `node_modules/microbundle` (devDependency — NOT in published dist)
- **Severity:** HIGH (3 separate CVEs, cannot auto-fix)
- **Status:** NOT FIXED — requires breaking major version change
- **CVEs:**
  - `serialize-javascript <=7.0.2` — GHSA-5c6j-r48x-rmvq: RCE via `RegExp.flags` / `Date.prototype.toISOString()` (CVSS 8.1)
  - `serialize-javascript <7.0.5` — GHSA-qj8w-gfj5-8c6v: CPU exhaustion DoS via crafted array-like objects (CVSS 5.9)
  - `rollup <2.80.0` — GHSA-mw96-cpmx-2vgc: Arbitrary file write via path traversal (CVSS: not scored)
- **Context:** These are exclusively in `microbundle@0.15.1`, used only at build time (`npm run build`). The vulnerabilities do NOT affect the published `dist/` package or SDK consumers. The fix would require `microbundle@0.6.0` which is a breaking major downgrade.
- **Recommended Action:** Pin `microbundle` to the latest available non-breaking patch, or migrate to a maintained bundler (e.g., `tsup`, `esbuild`). Do not run `npm audit fix --force` as it will break the build.

---

### FINDING 7

- **File:** `node_modules/ajv`, `node_modules/brace-expansion`, `node_modules/flatted`, `node_modules/yaml` (all transitive devDependencies)
- **Severity:** MODERATE (4 CVEs)
- **Status:** FIXED via `npm audit fix`
- **CVEs:**
  - `ajv <6.14.0` — GHSA-2g4f-4pwh-qvx6: ReDoS with `$data` option
  - `brace-expansion <1.1.13 || >=2.0.0 <2.0.3` — GHSA-f886-m6hf-6m8v: process hang via zero-step sequence
  - `flatted` — GHSA (unbounded recursion DoS in `parse()`)
  - `yaml 1.0.0 - 1.10.2` — GHSA-48c2-rrv3-qjmp: stack overflow via deeply nested YAML
- **Context:** All devDependencies. `npm audit fix` patched them.

---

### FINDING 8

- **File:** `.gitignore`
- **Severity:** MEDIUM
- **Status:** FIXED
- **Issue:** The original `.gitignore` only explicitly excluded `.env`, `.env.local`, and `.env.prod`. Variants like `.env.development`, `.env.test`, `.env.staging`, `.env.production` were not covered, creating a risk of accidentally committing such files.
- **Fix Applied:** Replaced the per-variant entries with `.env.*` glob pattern. Added `!**/.env.example` to ensure `example/.env.example` is still tracked.

---

### FINDING 9

- **File:** (missing)
- **Severity:** LOW
- **Status:** FIXED
- **Issue:** No `SECURITY.md` existed. For an open-source repository, the absence of a vulnerability disclosure policy means security researchers have no official channel to report issues, increasing the risk of public disclosure before a fix is available.
- **Fix Applied:** Created `SECURITY.md` with private advisory instructions, scope definition, response SLAs, and disclosure policy.

---

### FINDING 10

- **File:** `example/.env.example`
- **Severity:** LOW
- **Status:** FIXED
- **Issue:** The example directory's `.env.example` was missing OpenRouter, gateway, and router configuration variables documented in the root `.env.example`. Developers copying from `example/` as a starting point would be missing required variables.
- **Fix Applied:** Updated `example/.env.example` to mirror the root template with all variables and inline comments.

---

### FINDING 11

- **File:** `src/utils/constants.ts`, line 1
- **Severity:** LOW (informational)
- **Status:** NOT FIXED — intentional
- **Issue:** `DEFAULT_BASE_URL = 'https://irona-ai--model-select.modal.run'` uses a Modal.run URL (serverless cloud hosting). This is the production routing API endpoint. It is not a secret and is publicly reachable, but its presence in source code exposes the infrastructure provider (Modal) and the deployment naming convention.
- **Assessment:** This is acceptable for an SDK — the base URL must be in the client code. Not a security risk, but worth noting for infrastructure fingerprinting awareness.

---

### NOT FOUND (Verified Clean)

| Category                                  | Finding                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Injection (SQL/XSS/command)               | None — no database queries, no shell execution, no HTML rendering                        |
| Insecure deserialization                  | None — `JSON.parse` only; no `eval`, `Function()`, `yaml.load`, `pickle`                 |
| Path traversal                            | None — no file system reads/writes in `src/`; file paths not constructed from user input |
| Hardcoded secrets in `src/`               | None — all API keys read from `process.env` at runtime                                   |
| Credentials in log output                 | None — logger calls emit provider names and model IDs only, no keys or PII               |
| Missing auth checks                       | N/A — this is a client SDK, not a server with endpoints                                  |
| Broken access control                     | N/A — SDK validates its own API key on init, delegates auth to provider SDKs             |
| Sensitive data in `.env` / `.env.example` | None — root `.env` uses placeholder strings only                                         |
| Internal URLs / staging endpoints         | None — only `irona-ai--modal.run` (production) and well-known provider URLs              |
| Internal docs with sensitive context      | `engineering-docs/` describes architecture only, no credentials or internal URLs         |
| TODOs with sensitive context              | None found                                                                               |
| GitHub Actions secrets exposure           | Clean — all secrets use `${{ secrets.* }}`                                               |
| License incompatibility                   | All direct dependencies are MIT or Apache-2.0; no GPL/AGPL/LGPL in direct deps           |

---

## SUMMARY

| Severity  | Total Found | Fixed     | Remaining                               |
| --------- | ----------- | --------- | --------------------------------------- |
| CRITICAL  | 3           | 3         | 0 (keys must be rotated in git history) |
| HIGH      | 4           | 1 (axios) | 3 (microbundle dev-only, not in dist)   |
| MODERATE  | 4           | 4         | 0                                       |
| LOW       | 4           | 3         | 1 (informational: modal.run URL)        |
| **Total** | **15**      | **11**    | **4**                                   |

---

## REQUIRED MANUAL ACTIONS (cannot be automated)

1. **Rotate `sk_4E61QXK1N7eKCfTHZ4J-yyGXWWeug7Ji`** — IronaAI API key, present in git history via `example/testWithRealAPI.js` and `example/testOpenRouterGateway.js`. Generate a new key at https://app.irona.ai/dashboard/api-keys.

2. **Rotate `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`** — OpenRouter API key, present in git history via `example/testOpenRouterGateway.js`. Revoke and regenerate at https://openrouter.ai/keys.

3. **Scrub git history before making repo public** — Run BFG Repo Cleaner or `git filter-repo` to remove all commits containing the above keys. See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository

4. **Address microbundle vulnerabilities** — Consider migrating to `tsup` or `esbuild` to eliminate the `serialize-javascript` RCE chain (CVSS 8.1) in the build toolchain. Low urgency since this only affects developers running `npm run build`, not SDK consumers.

5. **Update SECURITY.md contact** — Add a direct security email address to `SECURITY.md` rather than relying solely on the GitHub org profile link.

---

## POST-AUDIT TEST RESULTS

```
Test Suites: 10 passed, 10 total
Tests:       130 passed, 130 total
Snapshots:   0 total
```

All 130 tests pass after remediation. No functionality modified.
