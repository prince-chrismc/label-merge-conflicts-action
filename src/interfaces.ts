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

export interface IGithubPRNode {
  node: {
    id: string
    number: string
    mergeable: string
    labels: {
      edges: IGithubLabelNode[]
    }
  }
}

export interface IGithubPageInfo {
  endCursor: string
  hasNextPage: boolean
}

export interface IGithubRepoPullRequets {
  repository: {
    pullRequests: {
      edges: IGithubPRNode[]
    }
  }
}
