# Contributing to Iris

Thanks for taking the time. Iris is a small project, kept by a household for its own use, and
shared in case it helps someone else.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/MouseionHouse/Iris/issues). Search it first: your issue may
already be there.

A bug report helps most when it says:

- what you did, step by step;
- what you expected, and what happened instead;
- the version of Iris (Settings → About), and where you run it: the browser, the Android app or
  the desktop shell, with its version;
- your homeserver's software (Synapse, Conduit, …), if the bug touches the server;
- a screenshot or the browser console's output, if you have one.

If the bug is in Cinny too, it belongs [upstream](https://github.com/cinnyapp/cinny/issues).

## Pull requests

Open [pull requests](https://github.com/MouseionHouse/Iris/pulls) against `dev`. For anything
larger than a fix, open an issue first, so we can agree on the change before you write it.

A pull request should:

- do one thing, and say what and why;
- name the issue it fixes, if there is one;
- pass the checks below;
- use [conventional commits](https://www.conventionalcommits.org) (`npm run commit` helps).

[`HACKING.md`](HACKING.md) has how to build and run Iris.

### Checks

GitHub runs these on every pull request (`.github/workflows/check.yml`). Run them yourself
first, with the Node version in `.node-version`:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

The pre-commit hook runs the typecheck, and ESLint and Prettier on the files you stage.
`npm run fix:prettier` fixes formatting.

### How a pull request is merged

Iris's real CI, and every merge, happen on the maintainer's own forge, which publishes `dev` to
GitHub. So a pull request is not merged on GitHub: once it is approved, its commits are brought
over to the forge, checked and merged there, and come back to GitHub with the next publish. The
pull request is then closed with a note saying so, and you stay the author of your commits.

By opening a pull request you agree that your work is offered under the project's license,
AGPL-3.0-only.

## Be patient

John Gibson keeps Iris in his spare time. A reply may take days or weeks.

Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).
