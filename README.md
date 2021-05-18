# Label Pull Requests with Merge Conflicts Automatically

[![MIT](https://img.shields.io/github/license/prince-chrismc/label-merge-conflicts-action)](https://github.com/prince-chrismc/label-merge-conflicts-action/blob/main/LICENSE)
[![codecov](https://img.shields.io/codecov/c/github/prince-chrismc/label-merge-conflicts-action)](https://codecov.io/gh/prince-chrismc/label-merge-conflicts-action)

## Purpose

This action _intuitively_ checks open pull request(s) for merge conflicts and marks them with a [label](https://guides.github.com/features/issues/#filtering).

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
    branches: [master]

permissions: # Optional: minimum permission required to add labels
  issues: write
  pull-requests: write

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

1. GitHub does not reliably compute the `mergeable` status which is used by this action to detect merge conflicts.
    * If `main` changes the mergeable status is unknown until someone (most likely this action) requests it.
[GitHub then tries to compute the status with an async job.](https://stackoverflow.com/a/30620973)
    * This is usually quick and simple, but there are no guarantees and GitHub might have issues. You can tweak `max_retries` and `wait_ms` to increase the timeout before giving up on a Pull Request.
2. GitHub does not run actions on pull requests which have conflicts
    * When there is a conflict it prevents the merge commit from being calculated. [See this thread](https://github.community/t/run-actions-on-pull-requests-with-merge-conflicts/17104).
    * This is required for the [`mergeable`](https://docs.github.com/en/graphql/reference/enums#mergeablestate) as per the [API documentation](https://docs.github.com/en/rest/reference/pulls#get-a-pull-request)

## FAQ - What are _Merge Changes_?

When [merging a pull request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-request-merges), no matter the
[strategy](https://git-scm.com/docs/merge-strategies), there may _inadvertently be changes_ which can have negative side effects. For example...

> I was working on an app with a friend and [...] I ran `git pull`. There were no merge conflicts, but _git added duplicate functions_ to a file after merge.
> I spent an hour trying to figure our what the problem was before realizing that **git had made a mistake** while merging. [ref](https://news.ycombinator.com/item?id=9871042)

## FAQ - How do I fix _"Resource not accessible by integration"_?

_This is a rapidly changing topic. Feel free to open an issue if there's any problems_

> Use the [workflow permissions](https://github.blog/changelog/2021-04-20-github-actions-control-permissions-for-github_token/) provided in the [example](#setup-a-workflow).

It boils down to the GitHub Action's permissions for forks. The [default permissions](https://docs.github.com/en/actions/reference/authentication-in-a-workflow#permissions-for-the-github_token) for any [event type](https://docs.github.com/en/actions/reference/events-that-trigger-workflows) is [`read` only](https://docs.github.com/en/actions/reference/authentication-in-a-workflow#permissions-for-the-github_token). The default can be [adjusted for the repository](https://docs.github.com/en/github/administering-a-repository/disabling-or-limiting-github-actions-for-a-repository) or [set for each workflow](https://github.blog/changelog/2021-04-20-github-actions-control-permissions-for-github_token/) explicitly. The _"legacy"_ method was described [here](https://github.com/prince-chrismc/label-merge-conflicts-action/blob/0b1d389f2639277f8066809c02bb59f21090737b/README.md#faq---how-do-i-fix-resource-not-accessible-by-integration).
