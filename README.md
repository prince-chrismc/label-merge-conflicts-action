# Label Pull Requests with Merge Conflicts Automatically
[![MIT](https://img.shields.io/github/license/prince-chrismc/label-merge-conflicts-action)](https://github.com/prince-chrismc/label-merge-conflicts-action/blob/main/LICENSE)
[![codecov](https://img.shields.io/codecov/c/github/prince-chrismc/label-merge-conflicts-action)](https://codecov.io/gh/prince-chrismc/label-merge-conflicts-action)

## Purpose

This action checks all open pull requests for merge conflicts and marks them with a [label](https://guides.github.com/features/issues/#filtering).

<p align="center">
  <img src="https://github.com/prince-chrismc/label-merge-conflicts-action/blob/logo/.github/label-merge-conflicts.png?raw=true">
</p>

> Work by [Geek & Poke: Being A Coder Made Easy](https://geek-and-poke.com/geekandpoke/2010/10/21/being-a-code-made-easy-chapter-1.html) ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)) just shorter.

## Add it to your Project

### Create a Label

You'll need to manually create a label through GitHub. This can be done through the UI if you so with.

### Setup a Workflow

```yml
name: Auto Label Conflicts
on:
  push:
    branches: [master]
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [master]

jobs:
  auto-label:
    runs-on: ubuntu-latest
    steps:
      - uses: prince-chrismc/label-merge-conflicts-action@v1
        with:
          conflict_label_name: "has conflict"
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # These are optional incase you need to adjust for the limitations described below
          max_retries: 5
          wait_ms: 15000
```

## Limitations

1. Github does not reliably compute the `mergeable` status which is used by this action to detect merge conflicts.
    * If `main` changes the mergeable status is unknown until someone (most likely this action) requests it.
[GitHub then tries to compute the status with an async job.](https://stackoverflow.com/a/30620973)
    * This is usually quick and simple, but there are no guarantees and Github might have issues. You can tweak `max_retries` and `wait_ms` to increase the timeout before giving up on a Pull Request.
2. GitHub does not run actions on pull requests which have conflicts
    * When there is a conflict it prevents the merge commit from being calculated. [See this thread](https://github.community/t/run-actions-on-pull-requests-with-merge-conflicts/17104).
    * This is required for the [`mergeable`](https://docs.github.com/en/graphql/reference/enums#mergeablestate) as per the [API documentation](https://docs.github.com/en/rest/reference/pulls#get-a-pull-request)
