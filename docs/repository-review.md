# Repository review, 2026-10-22

> Storage status, 2026-10-26: the separate storage service described in this review has
> been removed. The website now depends on a small counter-store interface, connects to
> PostgreSQL directly, applies its schema before deployment, and retains idempotency
> records without expiration. Storage-specific evidence below documents the reviewed
> snapshot rather than the current architecture.

The largest problems are incomplete validation, infrastructure that obscures the tests,
and checks that substitute implementation details for real behavior. There is also a
feedback retry bug that needs a product decision about retention and ambiguous outcomes.

This review covers the working tree, including the existing telemetry changes. It does
not establish the state of deployed Render services or GitHub branch protection.

## Findings and disposition

| Priority | Finding                                                                             | Disposition                                     |
| -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| Critical | Locked production dependencies had published security advisories                    | Updated; development-only limitation documented |
| High     | The complete test command omitted storage tests; automation omitted several checks  | Fixed                                           |
| High     | Feedback retries can outlive server deduplication                                   | Design decision needed                          |
| Medium   | Builds included an unrestricted local context                                       | Fixed                                           |
| Medium   | Health probes used embedded JavaScript and inconsistent time limits                 | Fixed                                           |
| Medium   | The nested runner could not represent Debian's standard system accounts             | Fixed                                           |
| Medium   | Integration behavior, container machinery, and process fixtures were mixed together | Fixed                                           |
| Medium   | Packaging and footer tests provided indirect or artificial assurance                | Replaced with checks of the built application   |
| Medium   | Component suites duplicated TypeScript compilation machinery                        | Consolidated                                    |
| Medium   | Coverage percentages do not describe the whole application                          | Documented; measurement policy needs a decision |
| Medium   | Nested container infrastructure has a substantial maintenance cost                  | Retained with a proposed simpler alternative    |
| Medium   | Schema changes run inside ordinary requests                                         | Migration design recommended                    |
| Medium   | A generic storage service adds complexity to a counter workload                     | Architecture decision needed                    |
| Low      | A date formatting function returned its input unchanged                             | Removed                                         |
| Medium   | Editing a post title changes its address and counter keys                           | Stable address policy recommended               |

## Dependency advisories

**Evidence:** a live `npm audit --omit=dev` initially reported four affected production
packages in the website: Next.js, markdown-it, sharp, and source-map-js. The Next.js entry
included critical advisories. The storage production dependency tree had no reported
advisories. These results identify affected versions, not proof that every advisory's
exploit conditions are reachable in this application. Blog Markdown, for example, comes
from repository content rather than public submissions.
[Next.js advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[markdown-it advisory](https://github.com/advisories/GHSA-gfr2-rv44-r23c),
[sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
[source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

**Root cause:** version ranges permit updates, but a lockfile deliberately holds the
installed versions until it is refreshed. Reproducible builds alone do not keep
vulnerability fixes current.

**Solution implemented:** Next.js and its matching lint configuration are now 16.4.2,
markdown-it is 15.0.3, sharp is 0.35.5, and source-map-js is 1.2.2 in the lockfile.
Compatible brace-expansion fixes were also applied. Existing telemetry dependency
changes were retained. The production audit was repeated after updating.

**Remaining limitation:** five high-severity audit entries follow the development-only
`eslint-config-next` → `fast-glob` → `micromatch` → `braces` dependency chain. npm's offered
force fix downgrades the framework lint configuration to version 14; that is not an
appropriate solution for a Next.js 16 application. Track the upstream braces fix and
update the lint chain when a compatible release is available. The dependency is used
for local lint patterns, not the production server's request handling.
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

**Tradeoff and upgrade:** these updates stay within the existing major versions but
still require application and container checks. Rebuild and deploy the website image to
apply them in production. No deployed image was changed by updating the repository.
Make dependency review a regular maintenance task rather than relying on install-time
warnings being noticed.

## Incomplete validation

**Evidence:** the original root `test` script ran website tests and container integration
checks. Neither it nor the GitHub workflow ran `services/storage/test/*Suite.ts`. The
workflow also omitted lint, format verification, and the storage compiler. A container
build installs production dependencies; it does not substitute for these checks.

**Root cause:** two separately installed packages had no complete top-level validation
entry point. The root compiler also discovered service files under its broad include
pattern, using the website's compiler rather than the storage package's own compiler.

**Solution implemented:** [package scripts](../package.json) now run all three test
groups. `typecheck` checks the website and storage with their respective compilers. The
website configuration excludes the independently configured services directory. The
[workflow](../.github/workflows/test.yaml) installs both packages and runs lint, formatting,
type checking, and tests. The calling workflow also runs for pull requests targeting
`main`.

**Tradeoff and upgrade:** local contributors must install both packages. The short setup
instructions now say so. This preserves separate lockfiles and avoids an unrelated npm
workspace migration. The workflow changes take effect when committed; making checks
mandatory for merging remains a repository setting, not something established here.

## Feedback retries outlive the deduplication window

**Evidence:** [browser feedback](../src/infrastructure/browser-feedback.ts) retains pending
operations in local storage without an age limit. [The component](../src/components/feedback.tsx)
reuses those operations on retry. [Storage](../services/storage/src/postgres-storage.ts)
expires operation records after 15 minutes and permits their identifiers to be reused.
The existing storage test explicitly demonstrates reuse after expiration.

A concrete failure sequence is:

1. A vote commits, but the browser loses the response.
2. The browser retains the pending operation.
3. The server's operation record expires.
4. The visitor retries later; the same operation increments the counter again.

**Root cause:** browser persistence and server deduplication have independent lifetimes.
The retry identifier is reliable only while the server remembers it.

**Recommended solution:** define a shared retry lifetime, including clock and request
latency margins. Persist creation time with pending browser operations and stop replaying
ambiguous operations before server deduplication expires. Explain an unconfirmed result
and refresh aggregate totals without claiming that the original action failed. If the
product requires retries across long absences, retain server deduplication records for
that supported lifetime instead. Merely generating a new identifier or extending the
window by an arbitrary amount does not solve the mismatch.

**Tradeoff and upgrade:** bounded retries can leave a vote unconfirmed; durable replay
requires more retained state. Existing browser operations have no timestamp, so a rollout
must explicitly handle them as uncertain. Expired server records cannot reconstruct
whether old operations committed. No vote semantics or retention policy was silently
changed in this cleanup.

## Unrestricted build context

**Evidence:** builds used the repository root as context with neither a `.dockerignore`
nor a `.containerignore`. Local dependencies, build output, `.git`, and `.env` files were
eligible for inclusion in that context. Explicit `COPY` statements limited final image
contents; this is not evidence that credentials were shipped in a production image.

**Root cause:** source control exclusions were being relied on for a separate build
boundary. A `.gitignore` is not a container build ignore file.

**Solution implemented:** [.dockerignore](../.dockerignore) excludes dependencies,
generated output, local credentials, and repository metadata. The nested runner carries
that file into its inner build context too. Docker and Podman both support this file.
[Docker build context documentation](https://docs.docker.com/build/concepts/context/#dockerignore-files),
[Podman build documentation](https://docs.podman.io/en/latest/markdown/podman-build.1.html#containerignore-dockerignore).

**Tradeoff and upgrade:** future builds requiring an excluded asset must explicitly
reconsider the rule. Application source, blog content, lockfiles, and integration suites
remain available. This changes future builds, not existing images.

## Health probes and container account mappings

**Evidence:** The application images already include Node. Adding `curl` to those images
solely for health checks introduced an extra operating system dependency. The slim Node
image does not include `curl` by default.

**Root cause:** health checks were implemented with a separate executable even though
the application runtime can make the same bounded HTTP request. Development and
integration readiness checks also need to use the same request behavior.

**Solution implemented:** [the health-check script](../scripts/health-check.mjs) uses
Node's built-in `fetch` with a two-second deadline and fails on non-success responses.
Compose invokes it directly with `CMD`; development and integration readiness checks
invoke the same script. The two-second request limit fits inside the three-second Compose
probe timeout. Storage liveness remains independent of PostgreSQL, while readiness
still exercises the database connection. The integration runner waits for its Compose
connection without installing `curl`.
[Compose healthcheck documentation](https://docs.docker.com/reference/compose-file/services/#healthcheck).

The first real build exposed an additional defect: the nested runner delegated only
50,000 user and group identifiers. Debian's package installer attempts to use identifier
65,534 and failed with `setgroups` and `setegid` errors. The
[runner image](../containers/integration/runner.containerfile) now provides a complete
0-through-65,535 inner range, reserving the outer runner's own identifier and excluding
the outer root account. The two subordinate ranges fit inside a parent namespace with
the usual 65,536 subordinate identifiers.
[Subordinate user ranges](https://www.man7.org/linux/man-pages/man5/subuid.5.html),
[Podman's rootless requirements](https://docs.podman.io/en/latest/markdown/podman.1.html#rootless-mode).

**Tradeoff and upgrade:** The probe now depends on the Node runtime already present in
both application images. Rebuild and recreate both application containers to include
the script and use the new Compose checks. Render's existing health paths are unchanged;
no application database volume needs migration or deletion. The runner's account mapping
uses build cache volume `website-integration-build-cache-v2`; old image layers with
different ownership must not be reused.

## Test and infrastructure organization

**Evidence:** the old `integration/` directory mixed service-level tests, a request helper,
container definitions, a second container engine's settings, and an orchestration script.
Four Compose test services repeated the same image build, network, and credentials.

**Root cause:** files were grouped by the command that happened to use them rather than
by responsibility. Each test phase acquired another container service definition.

**Solution implemented:**

- `test/*Suite.ts`: website unit and component behavior.
- `test/integration/`: behavior exercised against built services.
- `test/fixtures/` and `services/storage/test/fixtures/`: child-process fixtures.
- `test/support/`: common component compilation support.
- `containers/integration/`: test images, Compose overlay, and inner engine settings.
- `scripts/integration.sh` and `scripts/integration-runner.sh`: host and inner lifecycle.

One test image/service now runs the different integration suites. Explicit suite filename
patterns prevent helpers and process fixtures from being discovered as tests. The
runner's duplicate package installation layers were also combined.

**Tradeoff and upgrade:** this is a boundary cleanup, not the elimination of container
orchestration. The public npm commands remain stable. Any private tooling that invokes
old file paths directly must use the new locations. Cached application builds remain the
default, and `test:no-cache` still uses disposable inner build storage.

## Tests that gave indirect assurance

**Evidence:** `WebsitePackagingSuite.ts` copied selected source directories and linked the
host's `node_modules`. It then imported source files, despite naming its claim after
packaging. It never ran the standalone artifact. `SiteFooterSuite.ts` compared header
and footer using a synthetic navigation replacement and matched component names in
source text.

**Root cause:** a convenient test environment was treated as equivalent to the deployed
boundary. Source spelling, simulated package contents, and replacement components can
stay correct while the built application is broken.

**Solution implemented:** both suites were removed. The existing integration suite already
serves the actual standalone image, verifies its stylesheet, and exercises its routes.
It now compares the real rendered header and footer links and checks the address stream's
placement. The fixed-position style assertion moved into the test that actually renders
the visitor component.

I did not find a current suite whose subject is another test suite. Tests of scripts are
not automatically wasteful: development startup must preserve saved credentials, retain
database data, report dependency failures, and still start the website. Those behavioral
checks remain. Some provider-command expectations in that fixture are still tightly
coupled to implementation; remove those expectations as the startup workflow is simplified,
while retaining the observable data-preservation and failure behavior.

**Tradeoff:** container tests are slower, but they are the right place to verify an image.
The navigation interaction tests remain fast component tests. No permanent test of test
file names, package-script strings, or this reorganization was added.

## Repeated component compilation

**Evidence:** six component suites contained near-identical TypeScript transpiler hooks,
with inconsistent source-map options. Some also embedded framework or child-component
replacements in JavaScript strings.

**Root cause:** the missing component test setup was solved independently in each suite.
That makes every suite responsible for compiler plumbing before it can describe behavior.

**Solution implemented:** [one shared hook](../test/support/typescript.ts) owns compilation
and source maps for the remaining component suites. It loads the existing TypeScript
compiler only when a component needs it. The native Node test runner and installed
compiler remain in use; no new dependency or test framework was added.

**Further improvement:** replace child-component substitutes with real components when
the behavior crosses that boundary. Consider a maintained component testing setup or a
small browser suite when that reduces the remaining mocking. A wholesale framework switch
was not needed for this deduplication and would change coverage and module-loading behavior.

## Coverage and browser validation

**Evidence:** the website command enforces 100% coverage over loaded files matching
`src/**`. The report excludes `shared/` and does not enumerate every unloaded application
module. For example, the root layout and scroll reveal component are absent from that
report. Removing redundant tests still leaves the report at 100%.

**Root cause:** the percentage is scoped to the execution and include pattern, whereas
its apparent precision can be mistaken for completeness. A DOM simulation also cannot
establish real browser layout, scrolling, animation smoothness, or mobile viewport fit.
[Node test coverage documentation](https://nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage).

**Recommended solution:** report coverage against an explicit source inventory, include
shared code, and justify exclusions. Choose thresholds based on meaningful branches and
failure cases rather than manufacturing tests to satisfy a global percentage. Use a small
Playwright suite for actual browser layout and navigation behavior that matters. Keep
fast domain tests for retries, concurrency, malformed inputs, and unavailable dependencies.

**Tradeoff:** browser tooling adds installation and execution costs. Coverage thresholds
remain unchanged here; removing assertions just to improve a number would compound the
problem. The checks performed in this review do not establish browser appearance.

## Nested container execution

**Evidence:** the integration command runs Podman inside Podman and exposes an inner
Docker-compatible service for Compose. It also requires user mappings, file capabilities,
tunnel and filesystem devices, alternate storage settings, and cached container storage.
The account-mapping failure above is a concrete cost of that design.

**Root cause:** strong isolation of test networks, images, and volumes is implemented as a
second container environment instead of using an already disposable host.

**Recommended alternative:** on a dedicated development or automation engine, run one
ordinary Compose project with a unique project name, explicit test volumes, and reliable
cleanup. In automation, let a disposable job machine provide the outer isolation. This
removes the nested engine and its compatibility configuration while keeping real service
tests and controlled outage phases.

**Tradeoff:** an ordinary Compose project shares the host engine and has a weaker boundary
against accidental host-volume access. The contributor documentation currently promises a
disposable outer container, so that guarantee was retained. Changing it is an explicit
workflow decision. Do not replace the current arrangement with a mounted host engine socket
while describing that as equivalent isolation.

## Schema migration during requests

**Evidence:** `PostgresStorage.initialize()` executes schema creation, table creation,
column alteration, and index creation. Reads, increments, readiness, and maintenance can
trigger it. An advisory lock serializes initialization, but the first request from a new
process can still perform schema work under normal request statement timeouts.

**Root cause:** bootstrap, upgrade, and ordinary storage access share one lifecycle. There
is no ordered record of which schema upgrades have been applied.

**Recommended solution:** use ordered, transactional migrations with a maintained
PostgreSQL migration tool. Apply them once as a deployment step before rolling out code;
request handlers should only access the schema. Keep startup independent of a temporary
database outage. Readiness can report that the required schema is unavailable without
trying to modify it.

**Tradeoff and upgrade:** introducing a migration history requires baselining existing
installations. Use additive schema changes compatible with both the old and new service
versions, then remove obsolete structures in a later release. A big schema rewrite during
this repository cleanup would make deployment less predictable, so none was performed.

## Generic storage for a narrow workload

**Evidence:** the application uses page and feedback counters, but persists arbitrary
JSON-shaped values behind a separate authenticated network service. Numeric operations
need JSON type checks, casts, integer checks, range checks, transactions, and retry records.
The generic storage types are repeated across the network boundary.

**Root cause:** the persistence abstraction is broader than the current operations. A
service boundary also introduces credentials, network failures, deployment ordering,
telemetry, and a separate dependency tree for a small workload.

**Recommended direction:** if counters are the intended workload, model counters explicitly
and let PostgreSQL enforce numeric constraints in typed columns. If independent deployment
or other clients justify a storage service, keep it with that clear contract. Otherwise,
consider moving persistence into the website's server-side application as a module while
retaining an interface for tests and graceful failure behavior.

**Tradeoff and upgrade:** a separate service can be a deliberate isolation or learning
choice. Shared wire concepts do not require sharing service internals. Converting existing
JSON entries requires an inventory and a migration for non-counter values; it should not
be inferred safe from the current frontend alone. No service or stored data was removed.

## Unnecessary date formatting abstraction

**Evidence and root cause:** `formatPostDate(date)` returned `date` unchanged. Both page
components called it, and a test asserted this identity transformation. A function name
suggested behavior that did not exist.

**Solution implemented:** the components render the already validated date. Date parsing
and validation tests remain, and the built article is checked for matching visible and
machine-readable dates. There is no data or address migration.

## Addresses derived from editable titles

**Evidence:** [post loading](../src/app/blog/posts.ts) derives the address from the primary
heading. Feedback subjects and page counters use that address. Renaming a title therefore
changes the public address and starts using different count keys.

**Root cause:** display text also serves as persistent identity.

**Recommended solution:** choose an explicit stable slug, either metadata or a filename
contract. Keep the old public addresses through redirects when titles change. Decide
whether historical counts follow the content identifier or remain associated with each
address, then migrate keys accordingly.

**Tradeoff:** title-derived addresses minimize authoring metadata. Changing the rule now
requires an inventory of existing URLs and search links, so it was documented rather than
applied as a naming cleanup.

## Validation

The final working tree passed:

- `npm test`: 271 tests, including 221 website unit/component tests, 17 storage tests,
  and 33 integration tests.
- `npm run test:no-cache`: the same 271 tests with fresh inner image and build storage.
- `npm run lint` and `npm run typecheck`, including the storage package's own compiler.
- `npm run format:verify`, shell syntax checks, and `git diff --check`.
- Production dependency audits for both packages: zero reported advisories. The five
  development-only audit entries described above remain.

The integration runs built the production images and exercised real health probes,
database outage and recovery, concurrent and repeated counter operations, rendered
markup and stylesheets, authenticated telemetry exports, telemetry failures, and shutdown.
These runs used Node 24.19.0 and Linux arm64 containers through the local Podman engine.
They do not establish real browser layout, hosted workflow execution, or deployed service
configuration. Existing telemetry, deployment, and article edits were preserved; no
production deployment was performed.
