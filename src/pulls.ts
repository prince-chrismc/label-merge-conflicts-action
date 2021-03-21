import * as core from '@actions/core'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'

import {IGithubPRNode, IGithubPullRequest} from './interfaces'
import {wait} from './wait'
import {getCommitChanges, getPullRequestChanges, getPullRequests} from './queries'
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
  } while (pullrequestsWithoutMergeStatus.length > 0 && maxRetries >= tries)

  // after $maxRetries we give up, probably Github had some issues
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

export const checkPullRequestForMergeChanges = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  pullRequest: IGithubPullRequest
): Promise<boolean> => {
  const prChangedFiles = await getPullRequestChanges(octokit, context, pullRequest.number)
  const mergeChangedFiles = await getCommitChanges(octokit, context, pullRequest.potentialMergeCommit.oid)

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
