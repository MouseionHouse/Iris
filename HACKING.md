# Developing Iris

> [!TIP]
> We recommend using a version manager as versions change very quickly.
> You will likely need to switch between multiple Node.js versions based
> on the needs of different projects you're working on. [NVM-windows]
> on Windows and [nvm] on Linux/macOS are pretty good choices. Recommended
> nodejs version is Krypton LTS (v24.13.1).

[nvm-windows]: https://github.com/coreybutler/nvm-windows#installation--upgrades
[nvm]: https://github.com/nvm-sh/nvm

Execute the following commands to start a development server:

```sh
npm ci # Installs all dependencies
npm start # Serve a development version
```

To build the app:

```sh
npm run build # Compiles the app into the dist/ directory
```

To commit changes:

```sh
npm run commit
```

## Running with Docker

This repository includes a Dockerfile, which builds the application from
source and serves it with Nginx on port 80. To use this locally, you can
build the container like so:

```
docker build -t iris:latest .
```

You can then run the container you've built with a command similar to this:

```
docker run -p 8080:80 iris:latest
```

This will forward your `localhost` port 8080 to the container's port 80.
You can visit the app in your browser by navigating to `http://localhost:8080`.

## Code formatting

[ESLint](https://eslint.org/) (`eslint.config.js`) and [Prettier](https://prettier.io/) keep the
code consistent, and `tsc` checks the types: `npm run lint` and `npm run typecheck`. The pre-commit
hook runs them on what you commit, and CI on every push. ESLint's warnings (`any`, non-null
assertions, `console`) are allowed but best not added to.

For a change the unit tests cannot see (a dependency upgrade, routing), run the app in a browser
against a local Synapse: [`test/e2e-app`](test/e2e-app/README.md).

## Helpful links

- [BEM methodology](http://getbem.com/introduction/)
- [Atomic design](https://bradfrost.com/blog/post/atomic-web-design/)
- [Matrix JavaScript SDK documentation](https://matrix-org.github.io/matrix-js-sdk/index.html)
