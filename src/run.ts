import * as core from '@actions/core'
import * as github from '@actions/github'
import {getLabels, hasSoftChanges} from './queries'
import {findLabelByName} from './util'
import {gatherPullRequests} from './pulls'
import {labelPullRequest, labelPullRequestWithHardConflicts} from './label'

export async function run(): Promise<void> {
  try {
    const conflictLabelName = core.getInput('conflict_label_name', {required: true})
    const myToken = core.getInput('github_token', {required: true})

    const octokit = github.getOctokit(myToken)
    const maxRetries = parseInt(core.getInput('max_retries'), 10) || 1 // Force invalid inputs to a 1
    const waitMs = parseInt(core.getInput('wait_ms'), 10)
    core.debug(`maxRetries=${maxRetries}; waitMs=${waitMs}`)

    const detectSoftChanges = core.getInput('detected_soft_changes') === 'true'
    core.debug(`detectSoftChanges=${detectSoftChanges}`)

    // Get the label to use
    const conflictLabel = findLabelByName(
      await getLabels(octokit, github.context, conflictLabelName),
      conflictLabelName
    )

    core.startGroup('🔎 Gather Pull Request Data')
    const pullRequests = await gatherPullRequests(octokit, github.context, waitMs, maxRetries)
    core.endGroup()

    core.startGroup('🏷️ Updating labels')
    if (!detectSoftChanges) {
      for (const pullRequest of pullRequests) {
        await labelPullRequest(octokit, pullRequest, conflictLabel)
      }
    } else {
      const hardConflicts = pullRequests.filter(pr => pr.node.mergeable === 'CONFLICTING')
      for (const pullRequest of hardConflicts) {
        await labelPullRequestWithHardConflicts(octokit, pullRequest, conflictLabel)
      }

      const mergeable = pullRequests.filter(pr => pr.node.mergeable === 'MERGEABLE')
      for (const pullRequest of mergeable) {
        if (await hasSoftChanges(octokit, github.context, pullRequest)) {
          await labelPullRequestWithHardConflicts(octokit, pullRequest, conflictLabel)
        } else {
          // TODO: the label should be removed!
        }
      }
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}
