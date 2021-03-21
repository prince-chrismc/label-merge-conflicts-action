export interface IGithubLabelNode {
  node: {
    id: string
    name: string
  }
}

export interface IGithubRepoLabels {
  repository: {
    labels: {
      edges: IGithubLabelNode[]
    }
  }
}

export interface IGithubPullRequest {
  id: string
  number: number
  mergeable: string
  potentialMergeCommit: {
    oid: string
  }
  labels: {
    edges: IGithubLabelNode[]
  }
}

export interface IGithubPRNode {
  node: IGithubPullRequest
}

export interface IGithubPageInfo {
  endCursor: string
  hasNextPage: boolean
}

export interface IGithubRepoPullRequest {
  repository: {
    pullRequest: IGithubPullRequest
  }
}

export interface IGithubRepoPullRequests {
  repository: {
    pullRequests: {
      edges: IGithubPRNode[]
      pageInfo: IGithubPageInfo
    }
  }
}

export interface IGitHubFileChange {
  sha: string
  filename: string
}
