import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'
import {IGithubPRNode, IGithubRepoLabels, IGithubRepoPullRequets} from './interfaces'

const getPullRequestPages = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  cursor?: string
): Promise<IGithubRepoPullRequets> => {
  let query
  if (cursor) {
    query = `{
      repository(owner: "${context.repo.owner}", name: "${context.repo.repo}") {
        pullRequests(first: 100, states: OPEN, after: "${cursor}") {
          edges {
            node {
              id
              number
              mergeable
              labels(first: 100) {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }`
  } else {
    query = `{
      repository(owner: "${context.repo.owner}", name: "${context.repo.repo}") {
        pullRequests(first: 100, states: OPEN) {
          edges {
            node {
              id
              number
              mergeable
              labels(first: 100) {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }`
  }

  return octokit.graphql(query, {
    headers: {Accept: 'application/vnd.github.ocelot-preview+json'}
  })
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

  return octokit.graphql(query, {
    headers: {Accept: 'application/vnd.github.ocelot-preview+json'}
  })
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

  return octokit.graphql(query, {
    headers: {Accept: 'application/vnd.github.starfire-preview+json'}
  })
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

  return octokit.graphql(query, {
    headers: {Accept: 'application/vnd.github.starfire-preview+json'}
  })
}
