import * as core from '@actions/core'
import { Context, GitHub } from './github.js'
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema'

import { IGitHubPRNode, IGitHubPullRequest } from './interfaces.js'
import { wait } from './wait.js'
import {
  getCommitChanges,
  getPullRequestChanges,
  getPullRequests,
  getPullRequest
} from './queries.js'
import { getPullrequestsWithoutMergeStatus } from './util.js'

export async function gatherPullRequest(
  octokit: GitHub,
  context: Context,
  prEvent: PullRequestEvent,
  waitMs: number,
  maxRetries: number
): Promise<IGitHubPullRequest> {
  let tries = 0
  let pullRequest: IGitHubPullRequest
  let uknownStatus: boolean =
    typeof prEvent.pull_request.mergeable !== 'boolean'

  do {
    tries++

    if (uknownStatus) {
      // on event trigger we still need to give it time to calc if it was unknown
      core.info(`...waiting for mergeable info...`)
      await wait(waitMs)
    }

    pullRequest = await getPullRequest(octokit, context, prEvent.number) // Always get it since the conversion is non-trivial
    uknownStatus = pullRequest.mergeable === 'UNKNOWN'
  } while (uknownStatus && maxRetries >= tries)

  if (uknownStatus) {
    throw new Error(
      `Could not determine mergeable status for: #${prEvent.number}`
    )
  }

  return pullRequest
}

export async function gatherPullRequests(
  octokit: GitHub,
  context: Context,
  waitMs: number,
  maxRetries: number
): Promise<IGitHubPRNode[]> {
  let tries = 0
  let pullRequests: IGitHubPRNode[] = []
  let pullrequestsWithoutMergeStatus: IGitHubPRNode[] = []

  do {
    tries++
    // if merge status is unknown for any PR, wait a bit and retry
    if (pullrequestsWithoutMergeStatus.length > 0) {
      core.info(`...waiting for mergeable info...`)
      await wait(waitMs)
    }

    pullRequests = await getPullRequests(octokit, context)
    pullrequestsWithoutMergeStatus =
      getPullrequestsWithoutMergeStatus(pullRequests) // filter PRs with unknown mergeable status
  } while (pullrequestsWithoutMergeStatus.length > 0 && maxRetries >= tries)

  // after $maxRetries we give up, probably GitHub had some issues
  if (pullrequestsWithoutMergeStatus.length > 0) {
    // Only set failed so that we can proccess the rest of the pull requests the do have mergeable calculated
    core.setFailed(
      `Could not determine mergeable status for: #${pullrequestsWithoutMergeStatus
        .map((pr) => {
          return pr.node.number
        })
        .join(', #')}`
    )
  }

  return pullRequests
}

export const checkPullRequestForMergeChanges = async (
  octokit: GitHub,
  context: Context,
  pullRequest: IGitHubPullRequest
): Promise<boolean> => {
  const prChangedFiles = await getPullRequestChanges(
    octokit,
    context,
    pullRequest.number
  )
  const mergeChangedFiles = await getCommitChanges(
    octokit,
    context,
    pullRequest.potentialMergeCommit.oid
  )

  if (prChangedFiles.length !== mergeChangedFiles.length) {
    core.info(`#${pullRequest.number} has a difference in the number of files`)
    return true // I'd be shocked if it was not!
  }

  // TODO: There's an assumption the files list should always be ordered the same which needs to be verified.
  for (let i = 0; i < prChangedFiles.length; i++) {
    if (prChangedFiles[i].sha !== mergeChangedFiles[i].sha) {
      core.info(`#${pullRequest.number} has a mismatching SHA's`)
      return true
    }
  }

  return false
}
