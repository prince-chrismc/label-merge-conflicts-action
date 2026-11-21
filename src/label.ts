import * as core from '@actions/core'
import { Context, GitHub } from './github.js'

import { IGitHubPullRequest, IGitHubLabelNode } from './interfaces.js'
import { checkPullRequestForMergeChanges } from './pulls.js'
import {
  addCommentToSubject,
  addLabelToLabelable,
  removeLabelFromLabelable
} from './queries.js'
import { isAlreadyLabeled } from './util.js'

interface Labelable {
  labelId: string
  labelableId: string
}

async function applyLabelable(
  octokit: GitHub,
  labelable: Labelable,
  hasLabel: boolean,
  pullRequestNumber: number,
  comment: { apply: boolean; body?: string }
) {
  if (hasLabel) {
    core.debug(`Skipping #${pullRequestNumber}, it is already labeled`)
    return
  }

  core.info(`Labeling #${pullRequestNumber}...`)
  await addLabelToLabelable(octokit, labelable)

  if (comment.apply) {
    await addCommentToSubject(
      octokit,
      labelable.labelableId,
      comment?.body as string
    )
  }
}

export async function updatePullRequestConflictLabel(
  octokit: GitHub,
  context: Context,
  pullRequest: IGitHubPullRequest,
  conflictLabel: IGitHubLabelNode,
  detectMergeChanges: boolean,
  comment: { apply: boolean; body?: string }
): Promise<void> {
  const hasLabel = isAlreadyLabeled(pullRequest, conflictLabel)
  const labelable: Labelable = {
    labelId: conflictLabel.node.id,
    labelableId: pullRequest.id
  }

  const writeBody = (author: string) =>
    `${comment?.body?.replace('${author}', author)}`

  switch (pullRequest.mergeable) {
    case 'CONFLICTING':
      await applyLabelable(octokit, labelable, hasLabel, pullRequest.number, {
        apply: comment.apply,
        body: writeBody(pullRequest?.author?.login)
      })
      break

    case 'MERGEABLE':
      if (
        detectMergeChanges &&
        (await checkPullRequestForMergeChanges(octokit, context, pullRequest))
      ) {
        await applyLabelable(octokit, labelable, hasLabel, pullRequest.number, {
          apply: comment.apply,
          body: writeBody(pullRequest?.author?.login)
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
