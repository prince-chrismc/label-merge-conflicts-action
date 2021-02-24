import * as core from '@actions/core'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'

import {IGithubPRNode} from './interfaces'
import {wait} from './wait'
import {getPullRequests} from './queries'
import {getPullrequestsWithoutMergeStatus} from './util'

// fetch PRs up to $maxRetries times
// multiple fetches are necessary because Github computes the 'mergeable' status asynchronously, on request,
// which might not be available directly after the merge
export async function gatherPullRequests(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  waitMs: number,
  maxRetries: number
): Promise<IGithubPRNode[]> {
  let tries = 0
  let pullRequests: IGithubPRNode[] = []
  let pullrequestsWithoutMergeStatus: IGithubPRNode[] = []

  do {
    tries++
    // if merge status is unknown for any PR, wait a bit and retry
    if (pullrequestsWithoutMergeStatus.length > 0) {
      core.info(`...waiting for mergeable info...`)
      await wait(waitMs)
    }

    pullRequests = await getPullRequests(octokit, context)
    pullrequestsWithoutMergeStatus = getPullrequestsWithoutMergeStatus(pullRequests) // filter PRs with unknown mergeable status
  } while (pullrequestsWithoutMergeStatus.length > 0 && tries < maxRetries)

  // after $maxRetries we give up, probably Github had some issues
  if (pullrequestsWithoutMergeStatus.length > 0) {
    core.setFailed(
      `Could not determine mergeable status for: ${pullrequestsWithoutMergeStatus
        .map(pr => {
          return pr.node.id
        })
        .join(', ')}`
    )
  }

  return pullRequests
}
