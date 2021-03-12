import * as core from '@actions/core'
import {GitHub} from '@actions/github/lib/utils'

import {IGithubPRNode, IGithubLabelNode} from './interfaces'
import {addLabelToLabelable, removeLabelFromLabelable} from './queries'
import {isAlreadyLabeled} from './util'

export async function labelPullRequestWithHardConflicts(
  octokit: InstanceType<typeof GitHub>,
  pullRequest: IGithubPRNode,
  conflictLabel: IGithubLabelNode
): Promise<void> {
  const labelable = {labelId: conflictLabel.node.id, labelableId: pullRequest.node.id}
  if (isAlreadyLabeled(pullRequest, conflictLabel)) {
    core.debug(`Skipping PR #${pullRequest.node.number}, it is conflicting but is already labeled`)
  } else {
    core.info(`Labeling PR #${pullRequest.node.number}...`)
    await addLabelToLabelable(octokit, labelable)
  }
}

export async function labelPullRequest(
  octokit: InstanceType<typeof GitHub>,
  pullRequest: IGithubPRNode,
  conflictLabel: IGithubLabelNode
): Promise<void> {
  const hasLabel = isAlreadyLabeled(pullRequest, conflictLabel)
  const labelable = {labelId: conflictLabel.node.id, labelableId: pullRequest.node.id}

  switch (pullRequest.node.mergeable) {
    case 'CONFLICTING':
      if (hasLabel) {
        core.debug(`Skipping PR #${pullRequest.node.number}, it is conflicting but is already labeled`)
        break
      }

      core.info(`Labeling PR #${pullRequest.node.number}...`)
      await addLabelToLabelable(octokit, labelable)
      break

    case 'MERGEABLE':
      if (hasLabel) {
        core.info(`Unlabeling PR #${pullRequest.node.number}...`)
        await removeLabelFromLabelable(octokit, labelable)
      }
      break

    default:
      break
  }
}
