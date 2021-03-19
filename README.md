# Label Pull Requests with Merge Conflicts Automatically

[![MIT](https://img.shields.io/github/license/prince-chrismc/label-merge-conflicts-action)](https://github.com/prince-chrismc/label-merge-conflicts-action/blob/main/LICENSE)
[![codecov](https://img.shields.io/codecov/c/github/prince-chrismc/label-merge-conflicts-action)](https://codecov.io/gh/prince-chrismc/label-merge-conflicts-action)

## Purpose

This action checks all open pull requests for merge conflicts and marks them with a [label](https://guides.github.com/features/issues/#filtering).

![comic](https://github.com/prince-chrismc/label-merge-conflicts-action/blob/main/.github/label-merge-conflicts.png?raw=true)

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
          detect_merge_changes: false # or true to handle as conflicts
```

## Limitations

1. Github does not reliably compute the `mergeable` status which is used by this action to detect merge conflicts.
    * If `main` changes the mergeable status is unknown until someone (most likely this action) requests it.
[GitHub then tries to compute the status with an async job.](https://stackoverflow.com/a/30620973)
    * This is usually quick and simple, but there are no guarantees and Github might have issues. You can tweak `max_retries` and `wait_ms` to increase the timeout before giving up on a Pull Request.
2. GitHub does not run actions on pull requests which have conflicts
    * When there is a conflict it prevents the merge commit from being calculated. [See this thread](https://github.community/t/run-actions-on-pull-requests-with-merge-conflicts/17104).
    * This is required for the [`mergeable`](https://docs.github.com/en/graphql/reference/enums#mergeablestate) as per the [API documentation](https://docs.github.com/en/rest/reference/pulls#get-a-pull-request)

## FAQ - What are _Merge Changes_?

During a merge, no matter the [strategy](https://git-scm.com/docs/merge-strategies), there may inadvertently be changes which can have negative side effects. For example, it may result in code that is no longer syntactically correct or checksums to be out of date.

## FAQ - How do I fix _"Resource not accessible by integration"_?

> TL;DR use a [Personal Access Token (PAT)](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) instead

It boils down to the GitHub authorization/permissions implementation. The permission given in an Action's run is based on the [Event type](https://docs.github.com/en/actions/reference/events-that-trigger-workflows), for Pull Requests its the head branch from which it originates from. If a user without read access opens a Pull Request from their fork then it will not be granted adequate permissions to set the labels. See [@actions/labeler#12](https://github.com/actions/labeler/issues/12), [@actions/first-interaction#10](https://github.com/actions/first-interaction/issues/10), and [Actions are severely limited](https://github.community/t/github-actions-are-severely-limited-on-prs/18179#M9249) for more information.
