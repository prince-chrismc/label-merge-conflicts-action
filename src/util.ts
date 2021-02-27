import {IGithubPRNode, IGithubLabelNode, IGithubRepoLabels} from './interfaces'

export function getPullrequestsWithoutMergeStatus(pullrequests: IGithubPRNode[]): IGithubPRNode[] {
  return pullrequests.filter((pullrequest: IGithubPRNode) => {
    return pullrequest.node.mergeable === 'UNKNOWN'
  })
}

export function isAlreadyLabeled(pullrequest: IGithubPRNode, label: IGithubLabelNode) {
  return pullrequest.node.labels.edges.find((l: IGithubLabelNode) => {
    return l.node.id === label.node.id
  })
}

export function findLabelByName(labelData: IGithubRepoLabels, labelName: string): IGithubLabelNode {
  for (const label of labelData.repository.labels.edges) {
    if (label.node.name === labelName) {
      return label
    }
  }

  throw new Error(`The label "${labelName}" was not found in your repository!`)
}
