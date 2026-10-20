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
