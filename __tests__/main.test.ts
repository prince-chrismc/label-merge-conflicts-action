import * as core from '@actions/core'
import * as github from '@actions/github'
import nock from 'nock'

import {wait} from '../src/wait'
import {IGitHubRepoLabels, IGitHubPRNode, IGitHubLabelNode, IGitHubPullRequest, MergeableState, MergeStateStatus} from '../src/interfaces'
import {findLabelByName, isAlreadyLabeled} from '../src/util'
import {
  getLabels,
  getPullRequests,
  addLabelToLabelable,
  removeLabelFromLabelable,
  getPullRequest
} from '../src/queries'
import {gatherPullRequests, gatherPullRequest} from '../src/pulls'
import {updatePullRequestConflictLabel} from '../src/label'
import {run} from '../src/run'

test('throws invalid number', async () => {
  const input = parseInt('foo', 10)
  await expect(wait(input)).rejects.toThrow('milliseconds not a number')
})

test('wait 500 ms', async () => {
  const start = new Date()
  await wait(500)
  const end = new Date()
  var delta = Math.abs(end.getTime() - start.getTime())
  expect(delta).toBeGreaterThan(450)
})

describe('label matching', () => {
  test('find exact from one label', () => {
    const labelNode = {node: {id: '1654984416', name: 'expected_label'}}
    const labelData: IGitHubRepoLabels = {repository: {labels: {edges: [labelNode]}}}
    const node = findLabelByName(labelData, 'expected_label')
    expect(node).toBe(labelNode)
  })

  test('finds from many labels', () => {
    const labelNode = {node: {id: '1654984416', name: 'expected_label'}}
    const labelData: IGitHubRepoLabels = {
      repository: {labels: {edges: [{node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}}, labelNode]}}
    }
    const node = findLabelByName(labelData, 'expected_label')
    expect(node).toBe(labelNode)
  })

  test('throws when no match', () => {
    const labelData: IGitHubRepoLabels = {
      repository: {
        labels: {
          edges: [
            {node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}},
            {node: {id: '1654984416', name: 'some other label'}}
          ]
        }
      }
    }
    expect(() => {
      findLabelByName(labelData, 'expected_label')
    }).toThrowError(/expected_label/)
  })
})

describe('pr label checking', () => {
  const expectedLabel: IGitHubLabelNode = {node: {id: '1654984416', name: 'expected_label'}}
  const makePr = (...label: IGitHubLabelNode[]): IGitHubPullRequest => {
    return {
      id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
      number: 7,
      mergeable: MergeableState.MERGEABLE,
      mergeStateStatus: MergeStateStatus.CLEAN,
      labels: {edges: [...label]}
    }
  }

  test('finds from one label', () => {
    const prNode = makePr(expectedLabel)
    const isLabeled = isAlreadyLabeled(prNode, expectedLabel)
    expect(isLabeled).toBeTruthy()
  })

  test('finds from many labels', () => {
    const prNode = makePr({node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}}, expectedLabel)
    const isLabeled = isAlreadyLabeled(prNode, expectedLabel)
    expect(isLabeled).toBeTruthy()
  })

  test('false when no match', () => {
    const prNode = makePr(
      {node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}},
      {node: {id: 'flbvalvbea;lygh;dbl;gblas;', name: 'some other label'}}
    )
    const isLabeled = isAlreadyLabeled(prNode, expectedLabel)
    expect(isLabeled).toBeFalsy()
  })
})

// Inputs for mock @actions/core
let inputs = {} as any

// Shallow clone original @actions/github context
let originalContext = {...github.context}

describe('queries', () => {
  beforeAll(() => {
    // Mock getInput
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(jest.fn())
    jest.spyOn(core, 'warning').mockImplementation(jest.fn())
    jest.spyOn(core, 'info').mockImplementation(jest.fn())
    jest.spyOn(core, 'debug').mockImplementation(jest.fn())
    jest.spyOn(core, 'startGroup').mockImplementation(jest.fn())
    jest.spyOn(core, 'endGroup').mockImplementation(jest.fn())
    jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())

    // Mock github context
    jest.spyOn(github.context, 'repo', 'get').mockImplementation(() => {
      return {
        owner: 'some-owner',
        repo: 'some-repo'
      }
    })
    github.context.ref = 'refs/heads/some-ref'
    github.context.sha = '1234567890123456789012345678901234567890'
    github.context.eventName = 'push'
  })

  beforeEach(() => {
    // Reset inputs
    inputs = {}
    github.context.eventName = originalContext.eventName
    github.context.payload = originalContext.payload
  })

  afterAll(() => {
    // Restore @actions/github context
    github.context.ref = originalContext.ref
    github.context.sha = originalContext.sha
    github.context.eventName = originalContext.eventName

    // Restore
    jest.restoreAllMocks()
  })

  const mockPullRequestEvent = {
    action: 'opened',
    number: 2,
    pull_request: {
      url: 'https://api.github.com/repos/Codertocat/Hello-World/pulls/2',
      id: 279147437,
      node_id: 'MDExOlB1bGxSZXF1ZXN0Mjc5MTQ3NDM3',
      number: 2,
      locked: false,
      title: 'Update the README with new information.',
      user: {
        login: 'Codertocat',
        id: 21031067,
        node_id: 'MDQ6VXNlcjIxMDMxMDY3'
      },
      body: 'This is a pretty simple change that we need to pull into master.',
      created_at: '2019-05-15T15:20:33Z',
      updated_at: '2019-05-15T15:20:33Z',
      head: {
        label: 'Codertocat:changes',
        ref: 'changes',
        sha: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
        user: {
          login: 'Codertocat',
          id: 21031067,
          node_id: 'MDQ6VXNlcjIxMDMxMDY3'
        },
        repo: {
          id: 186853002,
          node_id: 'MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=',
          name: 'Hello-World',
          full_name: 'Codertocat/Hello-World'
        }
      },
      base: {
        label: 'Codertocat:master',
        ref: 'master',
        sha: 'f95f852bd8fca8fcc58a9a2d6c842781e32a215e',
        user: {
          login: 'Codertocat',
          id: 21031067,
          node_id: 'MDQ6VXNlcjIxMDMxMDY3'
        },
        repo: {
          id: 186853002,
          node_id: 'MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=',
          name: 'Hello-World',
          full_name: 'Codertocat/Hello-World'
        }
      },
      author_association: 'OWNER',
      mergeable: null
    },
    repository: {
      id: 186853002,
      node_id: 'MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=',
      name: 'Hello-World',
      full_name: 'Codertocat/Hello-World'
    },
    sender: {
      login: 'Codertocat',
      id: 21031067,
      node_id: 'MDQ6VXNlcjIxMDMxMDY3'
    }
  }

  describe('for labels', () => {
    it('gets a matching label', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {data: {repository: {labels: {edges: [{node: {id: '1654984416', name: 'expected_label'}}]}}}})

      const octokit = github.getOctokit('justafaketoken')
      const labels = await getLabels(octokit, github.context, 'expected_label')

      expect(labels.repository.labels.edges.length).toBe(1)
      expect(labels.repository.labels.edges[0].node.id).toBe('1654984416')
      expect(labels.repository.labels.edges[0].node.name).toBe('expected_label')
    })

    it('gets many similar label', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              labels: {
                edges: [
                  {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'dependencies'}},
                  {node: {id: 'MDU6TGFiZWwyNzYwMjEzNzMw', name: 'wontfix'}}
                ]
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const labels = await getLabels(octokit, github.context, 'expected_label')

      expect(labels.repository.labels.edges.length).toBe(2)
      expect(labels.repository.labels.edges[0].node.id).toBe('MDU6TGFiZWwyNzYwMjE1ODI0')
      expect(labels.repository.labels.edges[0].node.name).toBe('dependencies')
      expect(labels.repository.labels.edges[1].node.id).toBe('MDU6TGFiZWwyNzYwMjEzNzMw')
      expect(labels.repository.labels.edges[1].node.name).toBe('wontfix')
    })

    it('gets many similar label', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              labels: {
                edges: [
                  {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'dependencies'}},
                  {node: {id: 'MDU6TGFiZWwyNzYwMjEzNzMw', name: 'wontfix'}}
                ]
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const labels = await getLabels(octokit, github.context, 'expected_label')

      expect(labels.repository.labels.edges.length).toBe(2)
      expect(labels.repository.labels.edges[0].node.id).toBe('MDU6TGFiZWwyNzYwMjE1ODI0')
      expect(labels.repository.labels.edges[0].node.name).toBe('dependencies')
      expect(labels.repository.labels.edges[1].node.id).toBe('MDU6TGFiZWwyNzYwMjEzNzMw')
      expect(labels.repository.labels.edges[1].node.name).toBe('wontfix')
    })

    it('throws on error response', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(400, {
          message: 'Body should be a JSON object',
          documentation_url: 'https://docs.github.com/graphql'
        })

      const octokit = github.getOctokit('justafaketoken')
      const labels = getLabels(octokit, github.context, 'expected_label')

      await expect(labels).rejects.toThrowError()
    })
  })

  describe('for pull requests', () => {
    it('gets a pull request', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              pullRequests: {
                edges: [
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
                      number: 7,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {edges: []}
                    }
                  }
                ],
                pageInfo: {endCursor: 'Y3Vyc29yOnYyOpHOIoELkg==', hasNextPage: false}
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const pullRequests = await getPullRequests(octokit, github.context)

      expect(pullRequests.length).toBe(1)
      expect(pullRequests[0].node.id).toBe('MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw')
      expect(pullRequests[0].node.number).toBe(7)
      expect(pullRequests[0].node.mergeable).toBe(MergeableState.MERGEABLE)
      expect(pullRequests[0].node.labels.edges.length).toBe(0)
    })

    it('get a specific pull request', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql', /\"variables\":{\"owner\":\"some-owner\",\"repo\":\"some-repo\",\"number\":49}/)
        .reply(200, {
          data: {
            repository: {
              pullRequest: {
                id: 'MDExOlB1bGxSZXF1ZXN0NTk3NDgzNjg4',
                number: 49,
                mergeable: MergeableState.MERGEABLE,
                mergeStateStatus: MergeStateStatus.CLEAN,
                labels: {
                  edges: [
                    {
                      node: {
                        id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                        name: 'Failed'
                      }
                    }
                  ]
                }
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const pullRequests = await getPullRequest(octokit, github.context, 49)

      expect(pullRequests.id).toBe('MDExOlB1bGxSZXF1ZXN0NTk3NDgzNjg4')
      expect(pullRequests.number).toBe(49)
      expect(pullRequests.mergeable).toBe(MergeableState.MERGEABLE)
      expect(pullRequests.labels.edges.length).toBe(1)
    })

    it('gets pages of pull requests', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              pullRequests: {
                edges: [
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
                      number: 7,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {edges: []}
                    }
                  }
                ],
                pageInfo: {endCursor: 'Y3Vyc29yOnYyOpHOGktShA==', hasNextPage: true}
              }
            }
          }
        })
        .post('/graphql', /Y3Vyc29yOnYyOpHOGktShA==/)
        .reply(200, {
          data: {
            repository: {
              pullRequests: {
                edges: [
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {edges: []}
                    }
                  }
                ],
                pageInfo: {endCursor: 'Y3Vyc29yOnYyOpHOGktShA==', hasNextPage: false}
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const pullRequests = await getPullRequests(octokit, github.context)

      expect(pullRequests.length).toBe(2)
      expect(pullRequests[0].node.id).toBe('MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw')
      expect(pullRequests[0].node.number).toBe(7)
      expect(pullRequests[0].node.mergeable).toBe(MergeableState.MERGEABLE)
      expect(pullRequests[0].node.labels.edges.length).toBe(0)

      expect(pullRequests[1].node.id).toBe('justsomestring')
      expect(pullRequests[1].node.number).toBe(64)
      expect(pullRequests[1].node.mergeable).toBe(MergeableState.MERGEABLE)
      expect(pullRequests[1].node.labels.edges.length).toBe(0)
    })

    it('gathers pull requests', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              pullRequests: {
                edges: [
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
                      number: 7,
                      mergeable: MergeableState.UNKNOWN,
                      mergeStateStatus: MergeStateStatus.UNKNOWN,
                      labels: {edges: []}
                    }
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {edges: []}
                    }
                  }
                ],
                pageInfo: {endCursor: 'Y3Vyc29yOnYyOpHOGktShA==', hasNextPage: false}
              }
            }
          }
        })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              pullRequests: {
                edges: [
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
                      number: 7,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {edges: []}
                    }
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {edges: []}
                    }
                  }
                ],
                pageInfo: {endCursor: 'Y3Vyc29yOnYyOpHOGktShA==', hasNextPage: false}
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const pullRequests = await gatherPullRequests(octokit, github.context, 10, 1)

      expect(pullRequests.length).toBe(2)
      expect(pullRequests[0].node.id).toBe('MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw')
      expect(pullRequests[0].node.number).toBe(7)
      expect(pullRequests[0].node.mergeable).toBe(MergeableState.MERGEABLE)
      expect(pullRequests[0].node.labels.edges.length).toBe(0)

      expect(pullRequests[1].node.id).toBe('justsomestring')
      expect(pullRequests[1].node.number).toBe(64)
      expect(pullRequests[1].node.mergeable).toBe(MergeableState.MERGEABLE)
      expect(pullRequests[1].node.labels.edges.length).toBe(0)
    })
  })

  it('retries gathering pull requests', async () => {
    const scope = nock('https://api.github.com', {
      reqheaders: {
        authorization: 'token justafaketoken'
      }
    })
      .post('/graphql')
      .times(3)
      .reply(200, {
        data: {
          repository: {
            pullRequests: {
              edges: [
                {
                  node: {
                    id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
                    number: 7,
                    mergeable: MergeableState.UNKNOWN,
                    mergeStateStatus: MergeStateStatus.UNKNOWN,
                    labels: {edges: []}
                  }
                },
                {
                  node: {
                    id: 'justsomestring',
                    number: 64,
                    mergeable: MergeableState.MERGEABLE,
                    mergeStateStatus: MergeStateStatus.CLEAN,
                    labels: {edges: []}
                  }
                }
              ],
              pageInfo: {endCursor: 'Y3Vyc29yOnYyOpHOGktShA==', hasNextPage: false}
            }
          }
        }
      })

    const octokit = github.getOctokit('justafaketoken')
    const start = new Date()
    const pullRequests = await gatherPullRequests(octokit, github.context, 25, 2)
    const end = new Date()
    var delta = Math.abs(end.getTime() - start.getTime())
    expect(delta).toBeGreaterThan(45)

    expect(pullRequests.length).toBe(2)
    expect(pullRequests[0].node.id).toBe('MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw')
    expect(pullRequests[0].node.number).toBe(7)
    expect(pullRequests[0].node.mergeable).toBe(MergeableState.UNKNOWN)
    expect(pullRequests[0].node.labels.edges.length).toBe(0)

    expect(pullRequests[1].node.id).toBe('justsomestring')
    expect(pullRequests[1].node.number).toBe(64)
    expect(pullRequests[1].node.mergeable).toBe(MergeableState.MERGEABLE)
    expect(pullRequests[1].node.labels.edges.length).toBe(0)
  })

  it('retries gathering a specific pull request', async () => {
    const scope = nock('https://api.github.com', {
      reqheaders: {
        authorization: 'token justafaketoken'
      }
    })
      .post('/graphql', /\"variables\":{\"owner\":\"some-owner\",\"repo\":\"some-repo\",\"number\":2}/)
      .reply(200, {
        data: {
          repository: {
            pullRequest: {
              id: 'MDExOlB1bGxSZXF1ZXN0NTk3NDgzNjg4',
              number: mockPullRequestEvent.number,
              mergeable: MergeableState.UNKNOWN,
              mergeStateStatus: MergeStateStatus.UNKNOWN,
              labels: {
                edges: [
                  {
                    node: {
                      id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                      name: 'Failed'
                    }
                  }
                ]
              }
            }
          }
        }
      })
      .post('/graphql', /\"variables\":{\"owner\":\"some-owner\",\"repo\":\"some-repo\",\"number\":2}/)
      .reply(200, {
        data: {
          repository: {
            pullRequest: {
              id: 'MDExOlB1bGxSZXF1ZXN0NTk3NDgzNjg4',
              number: mockPullRequestEvent.number,
              mergeable: MergeableState.MERGEABLE,
              mergeStateStatus: MergeStateStatus.CLEAN,
              labels: {
                edges: [
                  {
                    node: {
                      id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                      name: 'Failed'
                    }
                  }
                ]
              }
            }
          }
        }
      })

    const octokit = github.getOctokit('justafaketoken')
    const start = new Date()
    const pullRequest = await gatherPullRequest(octokit, github.context, mockPullRequestEvent as any, 25, 2)
    const end = new Date()
    var delta = Math.abs(end.getTime() - start.getTime())

    expect(delta).toBeGreaterThan(45)
    expect(delta).toBeLessThan(75)

    expect(pullRequest.id).toBe('MDExOlB1bGxSZXF1ZXN0NTk3NDgzNjg4')
    expect(pullRequest.number).toBe(mockPullRequestEvent.number)
    expect(pullRequest.mergeable).toBe(MergeableState.MERGEABLE)
    expect(pullRequest.labels.edges.length).toBe(1)
  })

  it('throws when unknown on specific pull request', async () => {
    const scope = nock('https://api.github.com', {
      reqheaders: {
        authorization: 'token justafaketoken'
      }
    })
      .post('/graphql', /\"variables\":{\"owner\":\"some-owner\",\"repo\":\"some-repo\",\"number\":2}/)
      .times(3)
      .reply(200, {
        data: {
          repository: {
            pullRequest: {
              id: 'MDExOlB1bGxSZXF1ZXN0NTk3NDgzNjg4',
              number: mockPullRequestEvent.number,
              mergeable: MergeableState.UNKNOWN,
              mergeStateStatus: MergeStateStatus.UNKNOWN,
              labels: {
                edges: [
                  {
                    node: {
                      id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                      name: 'Failed'
                    }
                  }
                ]
              }
            }
          }
        }
      })

    const octokit = github.getOctokit('justafaketoken')
    const pullRequest = gatherPullRequest(octokit, github.context, mockPullRequestEvent as any, 25, 2)

    await expect(pullRequest).rejects.toThrowError(/Could not determine mergeable status/)
  })

  describe('modifies labels', () => {
    describe('add', () => {
      it('adds a new label', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post(
            '/graphql',
            /addLabelsToLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
          )
          .reply(200, {data: {}})

        const octokit = github.getOctokit('justafaketoken')
        const add = await addLabelToLabelable(octokit, {
          labelId: 'MDU6TGFiZWwyNzYwMjE1ODI0',
          labelableId: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw'
        })

        expect(add).toBeTruthy()
      })

      it('throws on error response', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post('/graphql')
          .reply(400, {
            message: 'Body should be a JSON object',
            documentation_url: 'https://docs.github.com/graphql'
          })

        const octokit = github.getOctokit('justafaketoken')
        const labels = addLabelToLabelable(octokit, {
          labelId: 'MDU6TGFiZWwyNzYwMjE1ODI0',
          labelableId: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw'
        })

        await expect(labels).rejects.toThrowError()
      })
    })

    describe('remove', () => {
      it('removes an old label', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post(
            '/graphql',
            /removeLabelsFromLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
          )
          .reply(200, {data: {}})

        const octokit = github.getOctokit('justafaketoken')
        const add = await removeLabelFromLabelable(octokit, {
          labelId: 'MDU6TGFiZWwyNzYwMjE1ODI0',
          labelableId: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw'
        })

        expect(add).toBeTruthy()
      })

      it('throws on error response', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post('/graphql')
          .reply(400, {
            message: 'Body should be a JSON object',
            documentation_url: 'https://docs.github.com/graphql'
          })

        const octokit = github.getOctokit('justafaketoken')
        const labels = removeLabelFromLabelable(octokit, {
          labelId: 'MDU6TGFiZWwyNzYwMjE1ODI0',
          labelableId: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw'
        })

        await expect(labels).rejects.toThrowError()
      })
    })
  })

  describe('correctly determines labeling', () => {
    const expectedLabel: IGitHubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
    const makePr = (mergeable: MergeableState, mergeStateStatus: MergeStateStatus, ...label: IGitHubLabelNode[]): IGitHubPullRequest => {
      return {
        id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
        number: 7,
        mergeable: mergeable,
        mergeStateStatus: mergeStateStatus,
        labels: {edges: [...label]}
      }
    }

    describe('add', () => {
      it('adds a new label', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post(
            '/graphql',
            /addLabelsToLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
          )
          .reply(200, {data: {clientMutationId: 'auniqueid'}})

        const pullRequest = makePr(MergeableState.CONFLICTING, MergeStateStatus.DIRTY)
        const octokit = github.getOctokit('justafaketoken')
        const added = updatePullRequestConflictLabel(octokit, pullRequest, expectedLabel, false)

        await expect(added).resolves.toBe(undefined)
      })

      it('throws on error response', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post(
            '/graphql',
            /addLabelsToLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
          )
          .reply(400, {
            message: 'Body should be a JSON object',
            documentation_url: 'https://docs.github.com/graphql'
          })

        const pullRequest = makePr(MergeableState.CONFLICTING, MergeStateStatus.DIRTY)
        const octokit = github.getOctokit('justafaketoken')
        const added = updatePullRequestConflictLabel(octokit, pullRequest, expectedLabel, false)

        await expect(added).rejects.toThrowError()
      })

      it('does nothing when already labeled', async () => {
        const pullRequest = makePr(MergeableState.CONFLICTING, MergeStateStatus.DIRTY, expectedLabel)

        const octokit = github.getOctokit('justafaketoken')
        const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
        await updatePullRequestConflictLabel(octokit, pullRequest, expectedLabel, false)

        expect(mockFunction).not.toBeCalled()
      })
    })

    describe('remove', () => {
      it('removes an old label', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post(
            '/graphql',
            /removeLabelsFromLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
          )
          .reply(200, {data: {}})

        const pullRequest = makePr(MergeableState.MERGEABLE, MergeStateStatus.CLEAN, expectedLabel)

        const octokit = github.getOctokit('justafaketoken')
        const removed = updatePullRequestConflictLabel(octokit, pullRequest, expectedLabel, false)

        await expect(removed).resolves.toBe(undefined)
      })

      it('throws on error response', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .post('/graphql')
          .reply(400, {
            message: 'Body should be a JSON object',
            documentation_url: 'https://docs.github.com/graphql'
          })

        const pullRequest = makePr(MergeableState.MERGEABLE, MergeStateStatus.CLEAN, expectedLabel)
        const octokit = github.getOctokit('justafaketoken')
        const removed = updatePullRequestConflictLabel(octokit, pullRequest, expectedLabel, false)

        await expect(removed).rejects.toThrowError()
      })

      it('does nothing when no label', async () => {
        const pullRequest = makePr(MergeableState.MERGEABLE, MergeStateStatus.CLEAN)

        const octokit = github.getOctokit('justafaketoken')
        const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
        await updatePullRequestConflictLabel(octokit, pullRequest, expectedLabel, false)

        expect(mockFunction).not.toBeCalled()
      })
    })

  describe('the whole sequence', () => {
    test('push event works', async () => {
      github.context.eventName = 'push'

      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {repository: {labels: {edges: [{node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}]}}}
        })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              pullRequests: {
                edges: [
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NDQzNTg3NjI1',
                      number: 2109,
                      mergeable: MergeableState.UNKNOWN,
                      mergeStateStatus: MergeStateStatus.UNKNOWN,
                      labels: {
                        edges: [
                          {
                            node: {
                              id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                              name: 'Failed'
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NDYxODY4OTkz',
                      number: 2370,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {
                        edges: [
                          {
                            node: {
                              id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                              name: 'Failed'
                            }
                          },
                          {
                            node: {
                              id: 'MDU6TGFiZWwxNjMxNDkxOTY1',
                              name: 'blocked'
                            }
                          }
                        ]
                      }
                    }
                  }
                ],
                pageInfo: {
                  endCursor: 'Y3Vyc29yOnYyOpHOG4ePwQ==',
                  hasNextPage: false
                }
              }
            }
          }
        })
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              pullRequests: {
                edges: [
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NDQzNTg3NjI1',
                      number: 2109,
                      mergeable: MergeableState.CONFLICTING,
                      mergeStateStatus: MergeStateStatus.DIRTY,
                      labels: {
                        edges: [
                          {
                            node: {
                              id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                              name: 'Failed'
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    node: {
                      id: 'MDExOlB1bGxSZXF1ZXN0NDYxODY4OTkz',
                      number: 2370,
                      mergeable: MergeableState.MERGEABLE,
                      mergeStateStatus: MergeStateStatus.CLEAN,
                      labels: {
                        edges: [
                          {
                            node: {
                              id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                              name: 'Failed'
                            }
                          },
                          {
                            node: {
                              id: 'MDU6TGFiZWwxNjMxNDkxOTY1',
                              name: 'blocked'
                            }
                          }
                        ]
                      }
                    }
                  }
                ],
                pageInfo: {
                  endCursor: 'Y3Vyc29yOnYyOpHOG4ePwQ==',
                  hasNextPage: false
                }
              }
            }
          }
        })
        .post(
          '/graphql',
          /addLabelsToLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NDQzNTg3NjI1.*"}/
        )
        .reply(200, {data: {}})

      const mock = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())

      inputs['conflict_label_name'] = 'expected_label'
      inputs['github_token'] = 'justafaketoken'
      // inputs['max_retries'] = '1'
      inputs['wait_ms'] = '25'

      expect(github.context.eventName).toBe('push')

      await run()

      expect(mock).not.toBeCalled()
    })

    test('pull_request event works', async () => {
      github.context.eventName = 'pull_request'
      github.context.payload = mockPullRequestEvent as any

      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {repository: {labels: {edges: [{node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}]}}}
        })
        .post('/graphql', /\"variables\":{\"owner\":\"some-owner\",\"repo\":\"some-repo\",\"number\":2}/)
        .reply(200, {
          data: {
            repository: {
              pullRequest: {
                id: 'MDExOlB1bGxSZXF1ZXN0NDQzNTg3NjI1',
                number: mockPullRequestEvent.number,
                mergeable: MergeableState.UNKNOWN,
                mergeStateStatus: MergeStateStatus.UNKNOWN,
                labels: {
                  edges: [
                    {
                      node: {
                        id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                        name: 'Failed'
                      }
                    }
                  ]
                }
              }
            }
          }
        })
        .post('/graphql', /\"variables\":{\"owner\":\"some-owner\",\"repo\":\"some-repo\",\"number\":2}/)
        .reply(200, {
          data: {
            repository: {
              pullRequest: {
                id: 'MDExOlB1bGxSZXF1ZXN0NDQzNTg3NjI1',
                number: mockPullRequestEvent.number,
                mergeable: MergeableState.CONFLICTING,
                mergeStateStatus: MergeStateStatus.DIRTY,
                labels: {
                  edges: [
                    {
                      node: {
                        id: 'MDU6TGFiZWwxNTI3NTYzMTMy',
                        name: 'Failed'
                      }
                    }
                  ]
                }
              }
            }
          }
        })
        .post(
          '/graphql',
          /addLabelsToLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NDQzNTg3NjI1.*"}/
        )
        .reply(200, {data: {}})

      const mock = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())

      inputs['conflict_label_name'] = 'expected_label'
      inputs['github_token'] = 'justafaketoken'
      // inputs['max_retries'] = '1'
      inputs['wait_ms'] = '25'
      await run()

      expect(mock).not.toBeCalled()
    })

    test('fails when label does not exist', async () => {
      const scope = nock('https://api.github.com', {
        reqheaders: {
          authorization: 'token justafaketoken'
        }
      })
        .post('/graphql')
        .reply(200, {
          data: {repository: {labels: {edges: [{node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}]}}}
        })

      const mock = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())

      inputs['conflict_label_name'] = 'this will not match'
      inputs['github_token'] = 'justafaketoken'
      // inputs['max_retries'] = '1'
      inputs['wait_ms'] = '25'
      await run()

      expect(mock).toBeCalledWith('The label "this will not match" was not found in your repository!')
    })
  })
})
})
