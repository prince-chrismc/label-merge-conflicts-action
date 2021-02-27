import * as core from '@actions/core'
import * as github from '@actions/github'
import {getLabels} from './queries'
import {findLabelByName} from './util'
import {gatherPullRequests} from './pulls'
import {labelPullRequest} from './label'

export async function run(): Promise<void> {
  try {
    const conflictLabelName = core.getInput('conflict_label_name', {required: true})
    const myToken = core.getInput('github_token', {required: true})

    const octokit = github.getOctokit(myToken)
    const maxRetries = parseInt(core.getInput('max_retries'), 10) || 1 // Force invalid inputs to a 1
    const waitMs = parseInt(core.getInput('wait_ms'), 10)
    core.debug(`maxRetries=${maxRetries}; waitMs=${waitMs}`)

    // Get the label to use
    const conflictLabel = findLabelByName(
      await getLabels(octokit, github.context, conflictLabelName),
      conflictLabelName
    )

    core.startGroup('🔎 Gather Pull Request Data')
    const pullRequests = await gatherPullRequests(octokit, github.context, waitMs, maxRetries)
    core.endGroup()

    core.startGroup('🏷️ Updating labels')
    for (const pullRequest of pullRequests) {
      await labelPullRequest(octokit, pullRequest, conflictLabel)
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}
