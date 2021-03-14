import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'
import {IGithubPRNode, IGithubRepoLabels, IGithubRepoPullRequets, IGitHubFileChange} from './interfaces'

const getPullRequestPages = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  cursor?: string
): Promise<IGithubRepoPullRequets> => {
  const after = `, after: "${cursor}"`
  const query = `{
    repository(owner: "${context.repo.owner}", name: "${context.repo.repo}") {
      pullRequests(first: 100, states: OPEN ${cursor ? after : ''}) {
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

export const getPullRequestChanges = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  pullRequestnumber: number
): Promise<IGitHubFileChange[]> => {
  const head = await octokit.pulls.listFiles({
    ...context.repo,
    pull_number: pullRequestnumber // eslint-disable-line camelcase
  })

  return head.data
}

export const getCommitChanges = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  sha: string
): Promise<IGitHubFileChange[]> => {
  const mergeCommit = await octokit.repos.getCommit({
    ...context.repo,
    ref: sha
  })

  if (typeof mergeCommit.data.files === 'undefined') {
    throw new Error(`merge commit with an unknown diff!`)
  }

  return mergeCommit.data.files as IGitHubFileChange[]
}
