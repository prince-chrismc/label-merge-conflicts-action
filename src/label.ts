import * as core from '@actions/core'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'

import {IGithubPRNode, IGithubLabelNode} from './interfaces'
import {checkPullRequestForMergeChanges} from './pulls'
import {addLabelToLabelable, removeLabelFromLabelable} from './queries'
import {isAlreadyLabeled} from './util'

interface Labelable {
  labelId: string
  labelableId: string
}

async function applyLabelable(
  octokit: InstanceType<typeof GitHub>,
  labelable: Labelable,
  hasLabel: boolean,
  pullRequestNumber: number
) {
  if (hasLabel) {
    core.debug(`Skipping #${pullRequestNumber}, it is already labeled`)
    return
  }

  core.info(`Labeling #${pullRequestNumber}...`)
  await addLabelToLabelable(octokit, labelable)
}

export async function updatePullRequestConflictLabel(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  pullRequest: IGithubPRNode,
  conflictLabel: IGithubLabelNode,
  detectMergeChanges: boolean
): Promise<void> {
  const hasLabel = isAlreadyLabeled(pullRequest, conflictLabel)
  const labelable: Labelable = {labelId: conflictLabel.node.id, labelableId: pullRequest.node.id}

  switch (pullRequest.node.mergeable) {
    case 'CONFLICTING':
      await applyLabelable(octokit, labelable, hasLabel, pullRequest.node.number)
      break

    case 'MERGEABLE':
      if (detectMergeChanges && (await checkPullRequestForMergeChanges(octokit, context, pullRequest))) {
        await applyLabelable(octokit, labelable, hasLabel, pullRequest.node.number)
        break
      }

      if (hasLabel) {
        core.info(`Unmarking #${pullRequest.node.number}...`)
        await removeLabelFromLabelable(octokit, labelable)
      }
      break

    default:
      break
  }
}
