import {IGithubPRNode, IGithubLabelNode, IGithubRepoLabels} from './interfaces'

export function getPullrequestsWithoutMergeStatus(pullrequests: IGithubPRNode[]): IGithubPRNode[] {
  return pullrequests.filter((pullrequest: IGithubPRNode) => {
    return pullrequest.node.mergeable === 'UNKNOWN'
  })
}

export function getPullrequestsWithoutConflictingStatus(pullrequests: IGithubPRNode[]): IGithubPRNode[] {
  return pullrequests.filter((pullrequest: IGithubPRNode) => {
    return pullrequest.node.mergeable === 'CONFLICTING'
  })
}

export function getPullrequestsWithoutMergeableStatus(pullrequests: IGithubPRNode[]): IGithubPRNode[] {
  return pullrequests.filter((pullrequest: IGithubPRNode) => {
    return pullrequest.node.mergeable === 'MERGEABLE'
  })
}

export function isAlreadyLabeled(pullrequest: IGithubPRNode, label: IGithubLabelNode) {
  return pullrequest.node.labels.edges.find((l: IGithubLabelNode) => {
    return l.node.id === label.node.id
  })
}

export function findConflictLabel(labelData: IGithubRepoLabels, conflictLabelName: string): IGithubLabelNode {
  for (const label of labelData.repository.labels.edges) {
    if (label.node.name === conflictLabelName) {
      return label
    }
  }

  throw new Error(`"${conflictLabelName}" label not found in your repository!`)
}
