import * as core from '@actions/core'
import * as github from '@actions/github'
import {PullRequestEvent} from '@octokit/webhooks-definitions/schema'

import {getLabels} from './queries'
import {findLabelByName} from './util'
import {gatherPullRequest, gatherPullRequests} from './pulls'
import {updatePullRequestConflictLabel} from './label'

export async function run(): Promise<void> {
  try {
    const conflictLabelName = core.getInput('conflict_label_name', {required: true})
    const myToken = core.getInput('github_token', {required: true})

    const octokit = github.getOctokit(myToken)
    const maxRetries = parseInt(core.getInput('max_retries'), 10) || 1 // Force invalid inputs to a 1
    const waitMs = parseInt(core.getInput('wait_ms'), 10)
    core.debug(`maxRetries=${maxRetries}; waitMs=${waitMs}`)

    const detectMergeChanges = core.getInput('detect_merge_changes') === 'true'
    core.debug(`detectMergeChanges=${detectMergeChanges}`)

    // Get the label to use
    const conflictLabel = findLabelByName(
      await getLabels(octokit, github.context, conflictLabelName),
      conflictLabelName
    )

    if (github.context.eventName === 'pull_request') {
      const prEvent = github.context.payload as PullRequestEvent
      core.startGroup(`🔎 Gather data for Pull Request #${prEvent.number}`)
      core.info(` -- Mergeable: ${prEvent.pull_request.mergeable}`)
      core.info(` -- Labels: ${prEvent.pull_request.labels[0].name}`)
      const pr = await gatherPullRequest(octokit, github.context, prEvent, waitMs, maxRetries)
      core.endGroup()

      core.startGroup('🏷️ Updating labels')
      await updatePullRequestConflictLabel(octokit, github.context, pr, conflictLabel, detectMergeChanges)
      core.endGroup()

      return
    }

    core.startGroup('🔎 Gather data for all Pull Requests')
    const pullRequests = await gatherPullRequests(octokit, github.context, waitMs, maxRetries)
    core.endGroup()

    core.startGroup('🏷️ Updating labels')
    for (const pullRequest of pullRequests) {
      await updatePullRequestConflictLabel(octokit, github.context, pullRequest.node, conflictLabel, detectMergeChanges)
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}
