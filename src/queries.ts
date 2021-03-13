import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'
import {IGithubPRNode, IGithubRepoLabels, IGithubRepoPullRequets} from './interfaces'

const getPullRequestPages = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  cursor?: string
): Promise<IGithubRepoPullRequets> => {
  const query = `{
    repository(owner: "${context.repo.owner}", name: "${context.repo.repo}") {
      pullRequests(first: 100, states: OPEN, after: "${cursor ? cursor : null}") {
        edges {
          node {
            id
            number
            mergeable
            potentialMergeCommit {
              oid 
            }
            labels(first: 100) {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }`

  return octokit.graphql(query)
}

// fetch all PRs
export const getPullRequests = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context
): Promise<IGithubPRNode[]> => {
  let pullrequests: IGithubPRNode[] = []
  let cursor: string | undefined
  let hasNextPage = false

  do {
    const pullrequestData = await getPullRequestPages(octokit, context, cursor)

    pullrequests = pullrequests.concat(pullrequestData.repository.pullRequests.edges)
    cursor = pullrequestData.repository.pullRequests.pageInfo.endCursor
    hasNextPage = pullrequestData.repository.pullRequests.pageInfo.hasNextPage
  } while (hasNextPage)

  return pullrequests
}

export const getLabels = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  labelName: string
): Promise<IGithubRepoLabels> => {
  const query = `{
    repository(owner: "${context.repo.owner}", name: "${context.repo.repo}") {
      labels(first: 100, query: "${labelName}") {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }`

  return octokit.graphql(query)
}

export const addLabelToLabelable = async (
  octokit: InstanceType<typeof GitHub>,
  {
    labelId,
    labelableId
  }: {
    labelId: string
    labelableId: string
  }
) => {
  const query = `
  mutation {
    addLabelsToLabelable(input: {labelIds: ["${labelId}"], labelableId: "${labelableId}"}) {
      clientMutationId
    }
  }`

  return octokit.graphql(query)
}

export const removeLabelFromLabelable = async (
  octokit: InstanceType<typeof GitHub>,
  {
    labelId,
    labelableId
  }: {
    labelId: string
    labelableId: string
  }
) => {
  const query = `
  mutation {
    removeLabelsFromLabelable(input: {labelIds: ["${labelId}"], labelableId: "${labelableId}"}) {
      clientMutationId
    }
  }`

  return octokit.graphql(query)
}

export const hasMergeChanges = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  pullRequest: IGithubPRNode
): Promise<boolean> => {
  const head = await octokit.pulls.listFiles({
    ...context.repo,
    pull_number: pullRequest.node.number
  })

  const mergeCommit = await octokit.repos.getCommit({
    ...context.repo,
    ref: pullRequest.node.potentialMergeCommit.oid
  })

  const prChangedFiles = head.data
  const mergeChangedFiles = mergeCommit.data?.files

  if (typeof mergeChangedFiles === 'undefined') {
    throw new Error(`#${pullRequest.node.number} has a merge commit with an unknown diff!`)
  }

  if (prChangedFiles.length !== mergeChangedFiles.length) {
    return true // I'd be shocked if it was not!
  }

  // TODO: There's an assumption the files list should always be ordered the same which needs to be verified.
  prChangedFiles.forEach((diff, index) => {
    if (diff.sha !== mergeChangedFiles[index].sha) {
      return true
    }
  })

  return false
}
