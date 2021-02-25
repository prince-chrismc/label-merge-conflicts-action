import * as core from '@actions/core'
import * as github from '@actions/github'
import {addLabelToLabelable, getLabels, removeLabelFromLabelable} from './queries'
import {isAlreadyLabeled, findLabelByName} from './util'
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
    const conflictLabel = findLabelByName(
      await getLabels(octokit, github.context, conflictLabelName),
      conflictLabelName
    )

    core.startGroup('🔎 Gather Pull Request Data')
    const pullRequests = await gatherPullRequests(octokit, github.context, waitMs, maxRetries)
    core.endGroup()

    core.startGroup('🏷️ Updating labels')
    for (const pullRequest of pullRequests) {
      const hasLabel = isAlreadyLabeled(pullRequest, conflictLabel)
      switch (pullRequest.node.mergeable) {
        case 'CONFLICTING':
          if (hasLabel) {
            core.debug(`Skipping PR #${pullRequest.node.number}, it is conflicting but is already labeled`)
            break
          }

          core.info(`Labeling PR #${pullRequest.node.number}...`)
          await addLabelToLabelable(octokit, {
            labelId: conflictLabel.node.id,
            labelableId: pullRequest.node.id
          })
          break

        case 'MERGEABLE':
          if (hasLabel) {
            core.info(`Unlabeling PR #${pullRequest.node.number}...`)
            await removeLabelFromLabelable(octokit, {
              labelId: conflictLabel.node.id,
              labelableId: pullRequest.node.id
            })
          }
          break

        default:
          break
      }
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
