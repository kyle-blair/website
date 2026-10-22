# https://zerofourtwo.com

This is the source for my personal/portfolio/professional website.
I don't yet have a significant enough reason to separate those roles into different sites.

## dependencies / prerequisites

- Nodes.js
- npm

A container runtime such as podman is required to run both integration tests and the
various backing services the website uses, although everything is intentionally designed
to "just work" as well as conditions allow.

## quick start

Run `npm clean-install` from the repository root to install website dependencies.
Run `npm run dev` to start all backing services and the website with live reloading.
Run tests with `npm test`.

## architecture

### microservices

The site is designed as a loose collection of microservices. For now, these services are
colocated in this repository. Services are designed to behave well even when dependent or
collaborating services are unavailable. For example, the website server still serves
pages even if the page views or feedback mechanisms apis don't work. The display of the
correpsonding components clearly indicates the feature isn't available, but it might be
even smarter to simply not render the component if the service it depends on is
unavailable.
