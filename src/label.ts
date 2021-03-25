import * as core from '@actions/core'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'

import {IGitHubPullRequest, IGitHubLabelNode, MergeStateStatus} from './interfaces'
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
  pullRequest: IGitHubPullRequest,
  conflictLabel: IGitHubLabelNode,
  detectMergeChanges: boolean
): Promise<void> {
  const hasLabel = isAlreadyLabeled(pullRequest, conflictLabel)
  const labelable: Labelable = {labelId: conflictLabel.node.id, labelableId: pullRequest.id}

  if (pullRequest.mergeStateStatus) {
    if (pullRequest.mergeStateStatus === MergeStateStatus.DIRTY) {
      await applyLabelable(octokit, labelable, hasLabel, pullRequest.number)
    } else {
      if (detectMergeChanges && pullRequest.mergeStateStatus !== MergeStateStatus.CLEAN) {
        await applyLabelable(octokit, labelable, hasLabel, pullRequest.number)
      }

      if (hasLabel) {
        core.info(`Unmarking #${pullRequest.number}...`)
        await removeLabelFromLabelable(octokit, labelable)
      }
    }
  }
}
