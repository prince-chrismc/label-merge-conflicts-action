import * as core from '@actions/core'
import * as github from '@actions/github'
import {addLabelsToLabelable, getLabels, removeLabelsFromLabelable} from './queries'
import {
  getPullrequestsWithoutConflictingStatus,
  getPullrequestsWithoutMergeableStatus,
  isAlreadyLabeled,
  findConflictLabel
} from './util'
import {gatherPullRequests} from './pulls'

async function run(): Promise<void> {
  try {
    const conflictLabelName = core.getInput('conflict_label_name', {required: true})
    const myToken = core.getInput('github_token', {required: true})

    const octokit = github.getOctokit(myToken)
    const maxRetries = parseInt(core.getInput('max_retries'), 10)
    const waitMs = parseInt(core.getInput('wait_ms'), 10)
    core.debug(`maxRetries=${maxRetries}; waitMs=${waitMs}`)

    // Get the label to use
    const conflictLabel = findConflictLabel(
      await getLabels(octokit, github.context, conflictLabelName),
      conflictLabelName
    )

    core.startGroup('🔎 Gather Pull Request Data')
    const pullRequests = await gatherPullRequests(octokit, github.context, waitMs, maxRetries)
    core.endGroup()

    core.startGroup('🏷️ Updating labels')
    for (const pullrequest of getPullrequestsWithoutConflictingStatus(pullRequests)) {
      if (isAlreadyLabeled(pullrequest, conflictLabel)) {
        core.debug(`Skipping PR #${pullrequest.node.number}, it has conflicts but is already labeled`)
        continue
      }

      core.info(`Labeling PR #${pullrequest.node.number}...`)
      await addLabelsToLabelable(octokit, {
        labelIds: conflictLabel.node.id,
        labelableId: pullrequest.node.id
      })
    }

    for (const pullrequest of getPullrequestsWithoutMergeableStatus(pullRequests)) {
      if (isAlreadyLabeled(pullrequest, conflictLabel)) {
        core.info(`Unlabeling PR #${pullrequest.node.number}...`)
        await removeLabelsFromLabelable(octokit, {
          labelIds: conflictLabel.node.id,
          labelableId: pullrequest.node.id
        })
      }
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
