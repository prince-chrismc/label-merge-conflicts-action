import {IGitHubPRNode, IGitHubPullRequest, IGitHubLabelNode, IGitHubRepoLabels, MergeStateStatus} from './interfaces'

export function getPullrequestsWithoutMergeStatus(pullrequests: IGitHubPRNode[]): IGitHubPRNode[] {
  return pullrequests.filter((pullrequest: IGitHubPRNode) => {
    return pullrequest.node.mergeStateStatus === MergeStateStatus.UNKNOWN
  })
}

export function isAlreadyLabeled(pullrequest: IGitHubPullRequest, label: IGitHubLabelNode): boolean {
  return (
    pullrequest.labels.edges.find((l: IGitHubLabelNode) => {
      return l.node.id === label.node.id
    }) !== undefined
  )
}

export function findLabelByName(labelData: IGitHubRepoLabels, labelName: string): IGitHubLabelNode {
  for (const label of labelData.repository.labels.edges) {
    if (label.node.name === labelName) {
      return label
    }
  }

  throw new Error(`The label "${labelName}" was not found in your repository!`)
}
