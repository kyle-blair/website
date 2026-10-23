1. Revise the language on the home page to be less self-serving.
2. Improve the persistence mechanism.
    1. Perhaps use a cookie?
    2. Perhaps use some kind of public/private key cryptographic scheme to identify
       visitors in a privacy-evangelizing manner.
    3. Fix identified deficiencies such as a 15 minute server "memory" duration?
3. Add a tenets/values/privacy page.
4. Fix all build warnings.
    1. Open telemetry package deprecations/renames.
    2. Nextjs's filesystem reads used for blog posts.
5. Rationalize the various software development lifecycle actions and clean up the npm
   scripts accordingly. Actions include things like run (all) tests, run unit tests, check
   formatting, check types, check lint, validate (everything), build image(s), publish
   image(s), etcetera.
    1. Decide whether an entry point "shim" is worthwhile to avoid diverging experiences
       based on implementation details (such as programming language). Shell script shims
       are particularly intriguing. Shell is simple and ubiquitous. Every repo could have
       executable files so you could simply run `./test` and the test script would handle
       the implementation detail of what command actually triggers tests and how. That
       solution should also be powerful enough to handle various convenience features such
       as scoping `./test --scope=unit`. Same with other lifecycle actions such as
       `./validate` controlling whether a change is accepted or not and `./build` or
       `./make` being run to generate artifacts.
    2. Investigate whether "make" (cmake?) is a viable solution.
6. Remove the over-engineered storage service?
