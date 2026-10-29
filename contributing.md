# contributing

## readable

Software should read like a story. Comments in code are an anti-pattern and are not
allowed. If you think a comment is necessary, refactor the code until it is easily
understood without a comment.

## focused

Do not add every little detail to the readme file. Instead, rely on self-documenting
software, automated tests, sensible defaults, principle of least astonishment, etcetera so
that things are natural, robust, and well behaved. The best code is the code you didn't
write.

## twelve-factor app

Follow the twelve factors documented here [https://12factor.net/](https://12factor.net/).

## test driven development

All contributors must use test-driven development when implementing anything that matters.
At a bare minimum, this means every change to source code is accompanied by a test, with
very limited exceptions.

1. Write or update an automated test that exercises the intended behavior before changing
   source code.
2. Run the test and confirm that it fails for the expected reason.
3. Make the smallest code change needed to satisfy the test.
4. Run the test again and confirm that it passes.
5. Refactor as needed while keeping the tests passing.
6. Run the complete test suite before submitting the change.

## domain driven design

The source code should reflect reality.

## objects

Do not allow the construction of invalid objects. Throw an error instead. Consider using
special placeholder values instead of allowing null values.

## other tenets

- cloud native
- object oriented

Most of the "SOLID" acronym:

- single responsibility
- open-closed principle
- inversion of control (dependency injection)
- depend on abstractions, not concretions

## errors

Always employ proper error handling and propagation.
Do not swallow errors or lose error information when chaining.
At minimum, errors must be logged at an appropriate logging level.
Only catch errors you intend to handle.
All error messages must:

- Be written in full english sentences, including punctuation.
- Include a clear explanation of the problem that the target audience is likely to
  understand.
- Include actionable suggestions so that the recipient can resolve the error.

## logging

Almost everything should be logged.
The logs should tell a story about what the application is doing and why.
Prefer structured logs.
State facts and avoid assumptions.
Consider and use the appropriate log level from the six OpenTelemetry log levels.

Level Numeric value Meaning
TRACE 1 Fine-grained diagnostic events
DEBUG 5 Information useful for debugging
INFO 9 An event occurred
WARN 13 Something potentially problematic occurred, but not an error
ERROR 17 Something went wrong
FATAL 21 Fatal error, such as an application or system crash

Here are some examples:

- If an optional feature requires configuration and that configuration is absent, then an
  info log should be generated.
- If an optional feature requires configuration and that configuration is provided but
  invalid, then an error log should be generated.
- If a required feature requires configuration and that configuration is missing or
  invalid, then a fatal log should be generated.

## tests

Run `npm test` for the unit, component, and integration suites. Use `npm run test:unit`
or `npm run test:integration` to run one group. Integration tests run the website and
PostgreSQL inside a disposable container and cache build layers by default;
`npm run test:no-cache` uses fresh inner container storage. Run `npm run lint`,
`npm run typecheck`, and `npm run format:verify` before submitting changes.

Performance tests run separately with `npm run test:performance`. First install the
managed Chromium browser with `npm run test:performance:install`. The test builds and
starts the production website on port 3100, launches headless Chromium at 1920 by 1080
with a pixel density of 2, and takes about three minutes after startup.

After warming up, it collects three 30-second samples each with the background running
and paused, alternating their order. The address stream remains active in both cases.
Timestamped reports in `performance-results/` retain all samples, median and range,
processor use by browser process type, and machine, browser, and graphics configuration.

Processor percentages are relative to one core: 100 percent means one core fully used.
The graphics process's processor time is included; this measures processor use rather
than graphics hardware utilization. The running samples establish the current homepage
baseline, and their median minus the paused median estimates the background's added cost.
Compare reports from the same machine and browser configuration. The test records a
baseline without enforcing a performance budget; invalid samples fail instead of being
reported as valid measurements.

Using Podman on macOS, I needed to increase the ram of Podman's default virtual machine
from the default 2 GiB to 4 GiB.

```sh
podman machine stop <machine-name>
podman machine set --memory 4096 <machine-name>
podman machine start <machine-name>
```
