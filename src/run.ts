import * as core from '@actions/core'
import * as github from '@actions/github'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'
import {PullRequestEvent} from '@octokit/webhooks-definitions/schema'

import {getLabels} from './queries'
import {findLabelByName} from './util'
import {gatherPullRequest, gatherPullRequests} from './pulls'
import {updatePullRequestConflictLabel} from './label'
import {IGithubLabelNode} from './interfaces'

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
      return await runOnPullRequest(octokit, github.context, conflictLabel, waitMs, maxRetries, detectMergeChanges)
    }

    await runOnAll(octokit, github.context, conflictLabel, waitMs, maxRetries, detectMergeChanges)
  } catch (error) {
    core.setFailed(error.message)
  }
}

export async function runOnPullRequest(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  conflictLabel: IGithubLabelNode,
  waitMs: number,
  maxRetries: number,
  detectMergeChanges: boolean
): Promise<void> {
  const prEvent = context.payload as PullRequestEvent
  core.startGroup(`🔎 Gather data for Pull Request #${prEvent.number}`)
  const pr = await gatherPullRequest(octokit, context, prEvent, waitMs, maxRetries)
  core.endGroup()

  core.startGroup('🏷️ Updating labels')
  await updatePullRequestConflictLabel(octokit, context, pr, conflictLabel, detectMergeChanges)
  core.endGroup()
}

export async function runOnAll(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  conflictLabel: IGithubLabelNode,
  waitMs: number,
  maxRetries: number,
  detectMergeChanges: boolean
): Promise<void> {
  core.startGroup('🔎 Gather data for all Pull Requests')
  const pullRequests = await gatherPullRequests(octokit, context, waitMs, maxRetries)
  core.endGroup()

  core.startGroup('🏷️ Updating labels')
  for (const pullRequest of pullRequests) {
    await updatePullRequestConflictLabel(octokit, context, pullRequest.node, conflictLabel, detectMergeChanges)
  }
  core.endGroup()
}
