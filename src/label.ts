import * as core from '@actions/core'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'

import {IGitHubPullRequest, IGitHubLabelNode} from './interfaces'
import {checkPullRequestForMergeChanges} from './pulls'
import {addCommentToSubject, addLabelToLabelable, removeLabelFromLabelable} from './queries'
import {isAlreadyLabeled} from './util'

interface Labelable {
  labelId: string
  labelableId: string
}

async function applyLabelable(
  octokit: InstanceType<typeof GitHub>,
  labelable: Labelable,
  hasLabel: boolean,
  pullRequestNumber: number,
  comment: {apply: boolean; body: string}
) {
  if (hasLabel) {
    core.debug(`Skipping #${pullRequestNumber}, it is already labeled`)
    return
  }

  core.info(`Labeling #${pullRequestNumber}...`)
  await addLabelToLabelable(octokit, labelable)

  if (comment.apply) {
    await addCommentToSubject(octokit, labelable.labelableId, comment.body)
  }
}

export async function updatePullRequestConflictLabel(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  pullRequest: IGitHubPullRequest,
  conflictLabel: IGitHubLabelNode,
  detectMergeChanges: boolean,
  comment: {apply: boolean; body?: string}
): Promise<void> {
  const hasLabel = isAlreadyLabeled(pullRequest, conflictLabel)
  const labelable: Labelable = {labelId: conflictLabel.node.id, labelableId: pullRequest.id}

  const writeBody = (author: string) => `:wave: Hi, @${author},

${comment?.body}

I detected conflicts against the base branch. You'll want sync :arrows_counterclockwise: your branch with upstream!`

  switch (pullRequest.mergeable) {
    case 'CONFLICTING':
      await applyLabelable(octokit, labelable, hasLabel, pullRequest.number, {
        apply: comment.apply,
        body: comment.apply ? writeBody(pullRequest.author.login) : ''
      })
      break

    case 'MERGEABLE':
      if (detectMergeChanges && (await checkPullRequestForMergeChanges(octokit, context, pullRequest))) {
        await applyLabelable(octokit, labelable, hasLabel, pullRequest.number, {
          apply: comment.apply,
          body: comment.apply ? writeBody(pullRequest.author.login) : ''
        })
      } else if (hasLabel) {
        core.info(`Unmarking #${pullRequest.number}...`)
        await removeLabelFromLabelable(octokit, labelable)
      }
      break

    default:
      break
  }
}
