import * as core from '@actions/core'
import * as github from '@actions/github'
import { Context, GitHub } from './github.js'
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema'

import { getLabels } from './queries.js'
import { findLabelByName } from './util.js'
import { gatherPullRequest, gatherPullRequests } from './pulls.js'
import { updatePullRequestConflictLabel } from './label.js'
import { IGitHubLabelNode } from './interfaces.js'

export async function run(): Promise<void> {
  try {
    const conflictLabelName = core.getInput('conflict_label_name', {
      required: true
    })
    const myToken = core.getInput('github_token', { required: true })

    const octokit = github.getOctokit(myToken)
    const maxRetries = parseInt(core.getInput('max_retries'), 10) || 1 // Force invalid inputs to a 1
    const waitMs = parseInt(core.getInput('wait_ms'), 10)
    core.debug(`maxRetries=${maxRetries}; waitMs=${waitMs}`)

    const detectMergeChanges = core.getInput('detect_merge_changes') === 'true'
    core.debug(`detectMergeChanges=${detectMergeChanges}`)

    const commentTemplate = core.getInput('conflict_comment')
    const applyComment = (commentTemplate && commentTemplate !== '') as boolean
    core.debug(
      `applyComment=${applyComment} commentTemplate=${commentTemplate}`
    )

    // Get the label to use
    const conflictLabel = findLabelByName(
      await getLabels(octokit, github.context, conflictLabelName),
      conflictLabelName
    )

    if (github.context.eventName.includes('pull_request')) {
      return await runOnPullRequest(
        octokit,
        github.context,
        conflictLabel,
        waitMs,
        maxRetries,
        detectMergeChanges,
        {
          apply: applyComment,
          body: commentTemplate
        }
      )
    }

    await runOnAll(
      octokit,
      github.context,
      conflictLabel,
      waitMs,
      maxRetries,
      detectMergeChanges,
      {
        apply: applyComment,
        body: commentTemplate
      }
    )
  } catch (error) {
    core.setFailed(error as Error)
  }
}

export async function runOnPullRequest(
  octokit: GitHub,
  context: Context,
  conflictLabel: IGitHubLabelNode,
  waitMs: number,
  maxRetries: number,
  detectMergeChanges: boolean,
  comment: { apply: boolean; body?: string }
): Promise<void> {
  const prEvent = context.payload as PullRequestEvent
  core.startGroup(`🔎 Gather data for Pull Request #${prEvent.number}`)
  const pr = await gatherPullRequest(
    octokit,
    context,
    prEvent,
    waitMs,
    maxRetries
  )
  core.endGroup()

  core.startGroup('🏷️ Updating labels')
  await updatePullRequestConflictLabel(
    octokit,
    context,
    pr,
    conflictLabel,
    detectMergeChanges,
    comment
  )
  core.endGroup()
}

export async function runOnAll(
  octokit: GitHub,
  context: Context,
  conflictLabel: IGitHubLabelNode,
  waitMs: number,
  maxRetries: number,
  detectMergeChanges: boolean,
  comment: { apply: boolean; body?: string }
): Promise<void> {
  core.startGroup('🔎 Gather data for all Pull Requests')
  const pullRequests = await gatherPullRequests(
    octokit,
    context,
    waitMs,
    maxRetries
  )
  core.endGroup()

  core.startGroup('🏷️ Updating labels')
  for (const pullRequest of pullRequests) {
    await updatePullRequestConflictLabel(
      octokit,
      context,
      pullRequest.node,
      conflictLabel,
      detectMergeChanges,
      comment
    )
  }
  core.endGroup()
}
