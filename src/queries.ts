import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'
import {
  IGitHubPRNode,
  IGitHubRepoLabels,
  IGitHubRepoPullRequests,
  IGitHubRepoPullRequest,
  IGitHubPullRequest
} from './interfaces'

const getPullRequestPages = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  cursor?: string
): Promise<IGitHubRepoPullRequests> => {
  const after = `, after: "${cursor}"`
  const query = `{
    repository(owner: "${context.repo.owner}", name: "${context.repo.repo}") {
      pullRequests(first: 100, states: OPEN ${cursor ? after : ''}) {
        edges {
          node {
            id
            number
            mergeable
            mergeStateStatus
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

  return octokit.graphql(query, {
    headers: { Accept: 'application/vnd.github.merge-info-preview+json' }
  })
}

// fetch all PRs
export const getPullRequests = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context
): Promise<IGitHubPRNode[]> => {
  let pullrequests: IGitHubPRNode[] = []
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

export const getPullRequest = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  number: number
): Promise<IGitHubPullRequest> => {
  const query = `query ($owner: String!, $repo: String!, $number: Int!) { 
    repository(owner:$owner name:$repo) {
      pullRequest(number: $number) {
        id
        number
        mergeable
        mergeStateStatus
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
  }`

  const repoPr: IGitHubRepoPullRequest = await octokit.graphql(query, {
    ...context.repo,
    number,
    headers: { Accept: 'application/vnd.github.merge-info-preview+json' }
  })

  return repoPr.repository.pullRequest
}

export const getLabels = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  labelName: string
): Promise<IGitHubRepoLabels> => {
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
