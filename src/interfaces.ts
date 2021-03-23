export interface IGitHubLabelNode {
  node: {
    id: string
    name: string
  }
}

export interface IGitHubRepoLabels {
  repository: {
    labels: {
      edges: IGitHubLabelNode[]
    }
  }
}

export interface IGitHubPullRequest {
  id: string
  number: number
  mergeable: string
  potentialMergeCommit: {
    oid: string
  }
  labels: {
    edges: IGitHubLabelNode[]
  }
}

export interface IGitHubPRNode {
  node: IGitHubPullRequest
}

export interface IGitHubPageInfo {
  endCursor: string
  hasNextPage: boolean
}

export interface IGitHubRepoPullRequest {
  repository: {
    pullRequest: IGitHubPullRequest
  }
}

export interface IGitHubRepoPullRequests {
  repository: {
    pullRequests: {
      edges: IGitHubPRNode[]
      pageInfo: IGitHubPageInfo
    }
  }
}

export interface IGitHubFileChange {
  sha: string
  filename: string
}
