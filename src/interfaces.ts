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

export enum MergeStateStatus {
  BEHIND,
  BLOCKED,
  CLEAN,
  DIRTY,
  DRAFT,
  HAS_HOOKS,
  UNKNOWN,
  UNSTABLE
}

export enum MergeableState {
  CONFLICTING,
  MERGEABLE,
  UNKNOWN
}

export interface IGitHubPullRequest {
  id: string
  number: number
  mergeable: MergeableState
  mergeStateStatus: MergeStateStatus
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
