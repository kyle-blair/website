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

## tests

Run `npm test` for the complete suite, or `npm run test:integration` for integration
tests only. The integration tests use run a container for each service inside a disposable
container.

Using Podman on macOS, I needed to increase the ram of Podman's default virtual machine
from the default 2 GiB to 4 GiB.

```sh
podman machine stop <machine-name>
podman machine set --memory 4096 <machine-name>
podman machine start <machine-name>
```
