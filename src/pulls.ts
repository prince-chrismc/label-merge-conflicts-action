import * as core from '@actions/core'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'
import {PullRequestEvent} from '@octokit/webhooks-definitions/schema'

import {IGitHubPRNode, IGitHubPullRequest, MergeStateStatus} from './interfaces'
import {wait} from './wait'
import {getPullRequests, getPullRequest} from './queries'
import {getPullrequestsWithoutMergeStatus} from './util'

export async function gatherPullRequest(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  prEvent: PullRequestEvent,
  waitMs: number,
  maxRetries: number
): Promise<IGitHubPullRequest> {
  let tries = 0
  let pullRequest: IGitHubPullRequest
  let uknownStatus: boolean = typeof prEvent.pull_request.mergeable !== 'boolean'

  do {
    tries++

    if (uknownStatus) {
      // on event trigger we still need to give it time to calc if it was unknown
      core.info(`...waiting for mergeable info...`)
      await wait(waitMs)
    }

    pullRequest = await getPullRequest(octokit, context, prEvent.number) // Always get it since the conversion is non-trivial
    uknownStatus = pullRequest.mergeStateStatus === MergeStateStatus.UNKNOWN
  } while (uknownStatus && maxRetries >= tries)

  if (uknownStatus) {
    throw new Error(`Could not determine mergeable status for: #${prEvent.number}`)
  }

  return pullRequest
}

export async function gatherPullRequests(
  octokit: InstanceType<typeof GitHub>,
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
    pullrequestsWithoutMergeStatus = getPullrequestsWithoutMergeStatus(pullRequests) // filter PRs with unknown mergeable status
  } while (pullrequestsWithoutMergeStatus.length > 0 && maxRetries >= tries)

  // after $maxRetries we give up, probably GitHub had some issues
  if (pullrequestsWithoutMergeStatus.length > 0) {
    // Only set failed so that we can proccess the rest of the pull requests the do have mergeable calculated
    core.setFailed(
      `Could not determine mergeable status for: #${pullrequestsWithoutMergeStatus
        .map(pr => {
          return pr.node.number
        })
        .join(', #')}`
    )
  }

  return pullRequests
}
