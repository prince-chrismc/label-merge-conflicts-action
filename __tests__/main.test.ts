import * as core from '@actions/core'
import * as github from '@actions/github'
import nock from 'nock'

import {wait} from '../src/wait'
import {IGithubRepoLabels, IGithubPRNode, IGithubLabelNode} from '../src/interfaces'
import {findLabelByName, isAlreadyLabeled} from '../src/util'
import {getLabels, getPullRequests, addLabelToLabelable, removeLabelFromLabelable} from '../src/queries'
import {gatherPullRequests} from '../src/pulls'
import {labelPullRequest} from '../src/label'
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
    const labelData: IGithubRepoLabels = {repository: {labels: {edges: [labelNode]}}}
    const node = findLabelByName(labelData, 'expected_label')
    expect(node).toBe(labelNode)
  })

  test('finds from many labels', () => {
    const labelNode = {node: {id: '1654984416', name: 'expected_label'}}
    const labelData: IGithubRepoLabels = {
      repository: {labels: {edges: [{node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}}, labelNode]}}
    }
    const node = findLabelByName(labelData, 'expected_label')
    expect(node).toBe(labelNode)
  })

  test('throws when no match', () => {
    const labelData: IGithubRepoLabels = {
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
  test('finds from one label', () => {
    const labelNode = {node: {id: '1654984416', name: 'expected_label'}}
    const prNode: IGithubPRNode = {
      node: {
        id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
        number: '7',
        mergeable: 'MERGEABLE',
        labels: {edges: [labelNode]}
      }
    }
    const isLabeled = isAlreadyLabeled(prNode, labelNode)
    expect(isLabeled).toBeTruthy()
  })

  test('finds from many labels', () => {
    const labelNode = {node: {id: '1654984416', name: 'expected_label'}}
    const prNode: IGithubPRNode = {
      node: {
        id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
        number: '7',
        mergeable: 'MERGEABLE',
        labels: {edges: [{node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}}, labelNode]}
      }
    }
    const isLabeled = isAlreadyLabeled(prNode, labelNode)
    expect(isLabeled).toBeTruthy()
  })

  test('false when no match', () => {
    const labelNode = {node: {id: '1654984416', name: 'expected_label'}}
    const prNode: IGithubPRNode = {
      node: {
        id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
        number: '7',
        mergeable: 'MERGEABLE',
        labels: {
          edges: [
            {node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}},
            {node: {id: 'flbvalvbea;lygh;dbl;gblas;', name: 'some other label'}}
          ]
        }
      }
    }
    const isLabeled = isAlreadyLabeled(prNode, labelNode)
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
  })

  beforeEach(() => {
    // Reset inputs
    inputs = {}
  })

  afterAll(() => {
    // Restore @actions/github context
    github.context.ref = originalContext.ref
    github.context.sha = originalContext.sha

    // Restore
    jest.restoreAllMocks()
  })

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
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'Y3Vyc29yOnYyOpHOIoELkg=='
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
      expect(pullRequests[0].node.mergeable).toBe('MERGEABLE')
      expect(pullRequests[0].node.labels.edges.length).toBe(0)
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
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'Y3Vyc29yOnYyOpHOIoELkg=='
                  }
                ],
                pageInfo: {endCursor: 'dfgsdfhgsdghfgh==', hasNextPage: true}
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
                      id: 'justsomestring',
                      number: 64,
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'dfgsdfhgsdghfgh=='
                  }
                ],
                pageInfo: {endCursor: 'dfgsdfhgsdghfgh==', hasNextPage: false}
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const pullRequests = await getPullRequests(octokit, github.context)

      expect(pullRequests.length).toBe(2)
      expect(pullRequests[0].node.id).toBe('MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw')
      expect(pullRequests[0].node.number).toBe(7)
      expect(pullRequests[0].node.mergeable).toBe('MERGEABLE')
      expect(pullRequests[0].node.labels.edges.length).toBe(0)

      expect(pullRequests[1].node.id).toBe('justsomestring')
      expect(pullRequests[1].node.number).toBe(64)
      expect(pullRequests[1].node.mergeable).toBe('MERGEABLE')
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
                      mergeable: 'UNKNOWN',
                      labels: {edges: []}
                    },
                    cursor: 'Y3Vyc29yOnYyOpHOIoELkg=='
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'dfgsdfhgsdghfgh=='
                  }
                ],
                pageInfo: {endCursor: 'dfgsdfhgsdghfgh==', hasNextPage: false}
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
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'Y3Vyc29yOnYyOpHOIoELkg=='
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'dfgsdfhgsdghfgh=='
                  }
                ],
                pageInfo: {endCursor: 'dfgsdfhgsdghfgh==', hasNextPage: false}
              }
            }
          }
        })

      const octokit = github.getOctokit('justafaketoken')
      const pullRequests = await gatherPullRequests(octokit, github.context, 10, 1)

      expect(pullRequests.length).toBe(2)
      expect(pullRequests[0].node.id).toBe('MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw')
      expect(pullRequests[0].node.number).toBe(7)
      expect(pullRequests[0].node.mergeable).toBe('MERGEABLE')
      expect(pullRequests[0].node.labels.edges.length).toBe(0)

      expect(pullRequests[1].node.id).toBe('justsomestring')
      expect(pullRequests[1].node.number).toBe(64)
      expect(pullRequests[1].node.mergeable).toBe('MERGEABLE')
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
                    mergeable: 'UNKNOWN',
                    labels: {edges: []}
                  },
                  cursor: 'Y3Vyc29yOnYyOpHOIoELkg=='
                },
                {
                  node: {
                    id: 'justsomestring',
                    number: 64,
                    mergeable: 'MERGEABLE',
                    labels: {edges: []}
                  },
                  cursor: 'dfgsdfhgsdghfgh=='
                }
              ],
              pageInfo: {endCursor: 'dfgsdfhgsdghfgh==', hasNextPage: false}
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
    expect(pullRequests[0].node.mergeable).toBe('UNKNOWN')
    expect(pullRequests[0].node.labels.edges.length).toBe(0)

    expect(pullRequests[1].node.id).toBe('justsomestring')
    expect(pullRequests[1].node.number).toBe(64)
    expect(pullRequests[1].node.mergeable).toBe('MERGEABLE')
    expect(pullRequests[1].node.labels.edges.length).toBe(0)
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

        const labelNode: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
        const pullRequest: IGithubPRNode = {
          node: {
            id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
            number: '7',
            mergeable: 'CONFLICTING',
            labels: {edges: []}
          }
        }

        const octokit = github.getOctokit('justafaketoken')
        const added = labelPullRequest(octokit, pullRequest, labelNode)

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

        const labelNode: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
        const pullRequest: IGithubPRNode = {
          node: {
            id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
            number: '7',
            mergeable: 'CONFLICTING',
            labels: {edges: []}
          }
        }

        const octokit = github.getOctokit('justafaketoken')
        const added = labelPullRequest(octokit, pullRequest, labelNode)

        await expect(added).rejects.toThrowError()
      })

      it('does nothing when already labeled', async () => {
        const labelNode: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
        const pullRequest: IGithubPRNode = {
          node: {
            id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
            number: '7',
            mergeable: 'CONFLICTING',
            labels: {edges: [labelNode]}
          }
        }

        const octokit = github.getOctokit('justafaketoken')
        const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
        await labelPullRequest(octokit, pullRequest, labelNode)

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

        const labelNode: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
        const pullRequest: IGithubPRNode = {
          node: {
            id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
            number: '7',
            mergeable: 'MERGEABLE',
            labels: {edges: [labelNode]}
          }
        }

        const octokit = github.getOctokit('justafaketoken')
        const removed = labelPullRequest(octokit, pullRequest, labelNode)

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

        const labelNode: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
        const pullRequest: IGithubPRNode = {
          node: {
            id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
            number: '7',
            mergeable: 'MERGEABLE',
            labels: {edges: [labelNode]}
          }
        }

        const octokit = github.getOctokit('justafaketoken')
        const removed = labelPullRequest(octokit, pullRequest, labelNode)

        await expect(removed).rejects.toThrowError()
      })

      it('does nothing when no label', async () => {
        const labelNode: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
        const pullRequest: IGithubPRNode = {
          node: {
            id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
            number: '7',
            mergeable: 'MERGEABLE',
            labels: {edges: []}
          }
        }

        const octokit = github.getOctokit('justafaketoken')
        const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
        await labelPullRequest(octokit, pullRequest, labelNode)

        expect(mockFunction).not.toBeCalled()
      })
    })

    it('does nothing when mergeable is unknown', async () => {
      const labelNode: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
      const pullRequest: IGithubPRNode = {
        node: {
          id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
          number: '7',
          mergeable: 'UNKNOWN',
          labels: {edges: []}
        }
      }

      const octokit = github.getOctokit('justafaketoken')
      const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
      await labelPullRequest(octokit, pullRequest, labelNode)

      expect(mockFunction).not.toBeCalled()
    })
  })

  describe('the whole sequence', async () => {
    test('works', async () => {
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
                      id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
                      number: 7,
                      mergeable: 'UNKNOWN',
                      labels: {edges: []}
                    },
                    cursor: 'Y3Vyc29yOnYyOpHOIoELkg=='
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'dfgsdfhgsdghfgh=='
                  }
                ],
                pageInfo: {endCursor: 'dfgsdfhgsdghfgh==', hasNextPage: false}
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
                      mergeable: 'CONFLICTING',
                      labels: {edges: []}
                    },
                    cursor: 'Y3Vyc29yOnYyOpHOIoELkg=='
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    },
                    cursor: 'dfgsdfhgsdghfgh=='
                  }
                ],
                pageInfo: {endCursor: 'dfgsdfhgsdghfgh==', hasNextPage: false}
              }
            }
          }
        })
        .post(
          '/graphql',
          /addLabelsToLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
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
