# contributing

## readable

Software should read like a story. Comments in code are an anti-pattern and are not
allowed. If you think a comment is necessary, refactor the code until it is easily
understood without a comment.

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

Most of the "SOLID" acronym:

- single responsibility
- open-closed principle
- inversion of control (dependency injection)
- depend on abstractions, not concretions

Also:

- object oriented
- use design patterns
- avoid anti-patterns

## tests

Integration tests require a running Podman installation. On macOS and Windows,
start its machine first.

Integration builds need a container host with at least 4 GiB of memory.

On macOS, configure the existing machine once, substituting its name below.
Stopping it interrupts any other containers running on that machine.

```sh
podman machine stop <machine-name>
podman machine set --memory 4096 <machine-name>
podman machine start <machine-name>
```

Set `INTEGRATION_BUILD_CACHE=1` to retain inner images and build layers in the named
volume `website-integration-build-cache-v1`. This also works with `npm test`.
Unset the variable or set it to `0` to use disposable storage again; existing caches
are neither used nor deleted in that mode. Test containers, networks, and database
volumes are still removed, and credentials are generated anew. Each run first removes
leftover test resources from an interrupted run before creating fresh services.
Only one cached run can run at a time; a second one fails without removing the active
runner. To discard the cache when it is unused, run
`podman volume rm website-integration-build-cache-v1`. A storage or identifier-mapping
change in the runner may require discarding the cache before the next cached run.
