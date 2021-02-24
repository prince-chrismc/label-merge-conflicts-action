import * as core from '@actions/core'
import * as github from '@actions/github'
import nock from 'nock'

import {wait} from '../src/wait'
import {IGithubRepoLabels} from '../src/interfaces'
import {findConflictLabel} from '../src/util'
import {getLabels, getPullRequests} from '../src/queries'

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
    const node = findConflictLabel(labelData, 'expected_label')
    expect(node).toBe(labelNode)
  })

  test('finds from many labels', () => {
    const labelNode = {node: {id: '1654984416', name: 'expected_label'}}
    const labelData: IGithubRepoLabels = {
      repository: {labels: {edges: [{node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}}, labelNode]}}
    }
    const node = findConflictLabel(labelData, 'expected_label')
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
      findConflictLabel(labelData, 'expected_label')
    }).toThrowError(/expected_label/)
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

      expect(labels).rejects.toThrowError()
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

    it('gathers pages of pull requests', async () => {
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
  })
})
