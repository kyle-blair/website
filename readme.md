# https://zerofourtwo.com

This is the source for my personal/portfolio/professional website.
I don't yet have a significant enough reason to separate those roles into different sites.

## setup

Run `npm clean-install` from the repository root to install dependencies.
Run `npm run dev` to set up a local development environment with local continers for
dependencies and live website reloading.

Run tests with `npm test` or use `npm run test:cached` to preserve container build caches
so each image doesn't have to build from scratch. It's almost an order of magnitude faster.

