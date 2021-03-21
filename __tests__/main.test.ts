import * as core from '@actions/core'
import * as github from '@actions/github'
import nock from 'nock'

import {wait} from '../src/wait'
import {IGithubRepoLabels, IGithubPRNode, IGithubLabelNode} from '../src/interfaces'
import {findLabelByName, isAlreadyLabeled} from '../src/util'
import {
  getLabels,
  getPullRequests,
  addLabelToLabelable,
  removeLabelFromLabelable,
  getPullRequestChanges,
  getCommitChanges
} from '../src/queries'
import {checkPullRequestForMergeChanges, gatherPullRequests} from '../src/pulls'
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
  const expectedLabel: IGithubLabelNode = {node: {id: '1654984416', name: 'expected_label'}}
  const makePrNode = (...label: IGithubLabelNode[]): IGithubPRNode => {
    return {
      node: {
        id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
        number: 7,
        mergeable: 'MERGEABLE',
        potentialMergeCommit: {
          oid: '5ed0e15d4ca4ce73e847ee1f0369ee85a6e67bc9'
        },
        labels: {edges: [...label]}
      }
    }
  }

  test('finds from one label', () => {
    const prNode: IGithubPRNode = makePrNode(expectedLabel)
    const isLabeled = isAlreadyLabeled(prNode, expectedLabel)
    expect(isLabeled).toBeTruthy()
  })

  test('finds from many labels', () => {
    const prNode: IGithubPRNode = makePrNode(
      {node: {id: 'MDU6TGFiZWwxMjUyNDcxNTgz', name: 'has conflicts'}},
      expectedLabel
    )
    const isLabeled = isAlreadyLabeled(prNode, expectedLabel)
    expect(isLabeled).toBeTruthy()
  })

  test('false when no match', () => {
    const prNode: IGithubPRNode = makePrNode(
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
                      mergeable: 'MERGEABLE',
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
                    }
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: 'MERGEABLE',
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
                      mergeable: 'MERGEABLE',
                      labels: {edges: []}
                    }
                  },
                  {
                    node: {
                      id: 'justsomestring',
                      number: 64,
                      mergeable: 'MERGEABLE',
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
                  }
                },
                {
                  node: {
                    id: 'justsomestring',
                    number: 64,
                    mergeable: 'MERGEABLE',
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

  describe('gathers files changed', () => {
    describe('pull request', () => {
      it('gets a list', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(`/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/123/files?per_page=300`)
          .reply(200, [
            {
              sha: 'a8f3b51f97dbe31d1da584262e01b3ac2465d2d8',
              filename: 'recipes/protobuf/all/conandata.yml',
              patch:
                '@@ -20,6 +20,17 @@ patches:\n       base_path: "source_subfolder"\n     - patch_file: "patches/upstream-issue-7567-no-exp...'
            },
            {
              sha: 'cb0f93f2eeaa80d2fbddff1d7169e254f89b7ecb',
              filename: 'recipes/protobuf/all/conanfile.py',
              status: 'modified',
              patch:
                '@@ -109,7 +109,7 @@ def _patch_sources(self):\n         find_protoc = """\n \n # Find the protobuf compiler within t...'
            }
          ])

        const octokit = github.getOctokit('justafaketoken')
        const prChanges = await getPullRequestChanges(octokit, github.context, 123)

        expect(prChanges).toBeTruthy()
        expect(prChanges.length).toBe(2)
        expect(prChanges[1].sha).toBe('cb0f93f2eeaa80d2fbddff1d7169e254f89b7ecb')
        expect(prChanges[1].filename).toBe('recipes/protobuf/all/conanfile.py')
      })

      it('throws on error response', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(`/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/123/files?per_page=300`)
          .reply(404, {
            message: 'Not Found',
            documentation_url: 'https://docs.github.com/rest/reference/pulls#list-pull-requests-files'
          })

        const octokit = github.getOctokit('justafaketoken')
        const prCahnges = getPullRequestChanges(octokit, github.context, 123)

        await expect(prCahnges).rejects.toThrowError(/Not Found/)
      })
    })

    describe('merge commit', () => {
      const changes = [
        {
          sha: '06ea1fc2136e77e11f43923bd4c446fc8ea5caa3',
          filename: 'recipes/graphene/all/conandata.yml',
          status: 'added',
          patch:
            '@@ -0,0 +1,4 @@\n+sources:\n+  "1.10.2":\n+    url: "https://github.com/ebassi/graphene/releases/download/1.10.2/graphene-1.10.2...'
        },
        {
          sha: '8d9cd557cf27237c1ccc3cd4cf77a3033212d350',
          filename: 'recipes/graphene/all/conanfile.py',
          status: 'added',
          patch:
            '@@ -0,0 +1,96 @@\n+from conans import ConanFile, Meson, tools\n+from conans.errors import ConanInvalidConfiguration\n+import os\n+\n+req...'
        },
        {
          sha: 'f21465c9d35d01b9d27d822dc0efe05f39f1f792',
          filename: 'recipes/graphene/config.yml',
          status: 'added',
          patch: '@@ -0,0 +1,3 @@\n+versions:\n+    "1.10.2":\n+        folder: "all"'
        }
      ]
      it('gets a list', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(`/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${github.context.sha}`)
          .reply(200, {
            sha: '78db84765bc6de1a254d969c4d6b2f09a9862355',
            node_id: 'MDY6Q29tbWl0MjA0NjcxMjMyOjc4ZGI4NDc2NWJjNmRlMWEyNTRkOTY5YzRkNmIyZjA5YTk4NjIzNTU=',
            commit: {
              author: {
                date: '2021-01-07T15:31:36Z'
              },
              committer: {
                name: 'GitHub',
                email: 'noreply@github.com',
                date: '2021-01-07T15:31:36Z'
              },
              message: 'Generic PR'
            },
            committer: {
              login: 'web-flow',
              id: 19864447,
              node_id: 'MDQ6VXNlcjE5ODY0NDQ3'
            },
            parents: [
              {
                sha: 'b90be7f65a6eb23aa2c402d27d10ef548ac4be4e'
              }
            ],
            files: changes
          })

        const octokit = github.getOctokit('justafaketoken')
        const mergeChanges = await getCommitChanges(octokit, github.context, github.context.sha)

        expect(mergeChanges).toBeTruthy()
        expect(mergeChanges.length).toBe(3)
        expect(mergeChanges[2].sha).toBe('f21465c9d35d01b9d27d822dc0efe05f39f1f792')
        expect(mergeChanges[2].filename).toBe('recipes/graphene/config.yml')
      })

      it('throws on error response', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(`/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${github.context.sha}`)
          .reply(422, {
            message: 'No commit found for SHA: 78db84765bc6de1a254d969c4d6b2f09a62355',
            documentation_url: 'https://docs.github.com/rest/reference/repos#get-a-commit'
          })

        const octokit = github.getOctokit('justafaketoken')

        const mergeChanges = getCommitChanges(octokit, github.context, github.context.sha)
        expect(mergeChanges).rejects.toThrowError(/No commit found/)
      })

      it('throws with no files', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(`/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${github.context.sha}`)
          .reply(200, {
            sha: '78db84765bc6de1a254d969c4d6b2f09a9862355',
            node_id: 'MDY6Q29tbWl0MjA0NjcxMjMyOjc4ZGI4NDc2NWJjNmRlMWEyNTRkOTY5YzRkNmIyZjA5YTk4NjIzNTU=',
            commit: {
              author: {
                date: '2021-01-07T15:31:36Z'
              },
              committer: {
                name: 'GitHub',
                email: 'noreply@github.com',
                date: '2021-01-07T15:31:36Z'
              },
              message: 'Some Pull Request'
            },
            committer: {
              login: 'web-flow',
              id: 19864447,
              node_id: 'MDQ6VXNlcjE5ODY0NDQ3'
            },
            parents: [
              {
                sha: 'b90be7f65a6eb23aa2c402d27d10ef548ac4be4e'
              }
            ]
          })

        const octokit = github.getOctokit('justafaketoken')

        const mergeChanges = getCommitChanges(octokit, github.context, github.context.sha)
        expect(mergeChanges).rejects.toThrowError(/unknown diff/)
      })
    })

    describe('determines changes', () => {
      const prNode: IGithubPRNode = {
        node: {
          id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
          number: 7,
          mergeable: 'MERGEABLE',
          potentialMergeCommit: {
            oid: '5ed0e15d4ca4ce73e847ee1f0369ee85a6e67bc9'
          },
          labels: {edges: []}
        }
      }

      const changes = [
        {
          sha: 'a8f3b51f97dbe31d1da584262e01b3ac2465d2d8',
          filename: 'recipes/protobuf/all/conandata.yml',
          patch:
            '@@ -20,6 +20,17 @@ patches:\n       base_path: "source_subfolder"\n     - patch_file: "patches/upstream-issue-7567-no-exp...'
        },
        {
          sha: 'cb0f93f2eeaa80d2fbddff1d7169e254f89b7ecb',
          filename: 'recipes/protobuf/all/conanfile.py',
          status: 'modified',
          patch:
            '@@ -109,7 +109,7 @@ def _patch_sources(self):\n         find_protoc = """\n \n # Find the protobuf compiler within t...'
        }
      ]

      const makeCommitPage = (...changes: any[]) => {
        return {
          sha: '5ed0e15d4ca4ce73e847ee1f0369ee85a6e67bc9',
          node_id: 'MDY6Q29tbWl0MjA0NjcxMjMyOjc4ZGI4NDc2NWJjNmRlMWEyNTRkOTY5YzRkNmIyZjA5YTk4NjIzNTU=',
          commit: {
            author: {
              date: '2021-01-07T15:31:36Z'
            },
            committer: {
              name: 'GitHub',
              email: 'noreply@github.com',
              date: '2021-01-07T15:31:36Z'
            },
            message: 'Generic PR'
          },
          committer: {
            login: 'web-flow',
            id: 19864447,
            node_id: 'MDQ6VXNlcjE5ODY0NDQ3'
          },
          parents: [
            {
              sha: 'b90be7f65a6eb23aa2c402d27d10ef548ac4be4e'
            }
          ],
          files: [...changes]
        }
      }

      it('returns yes when list size is different', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${prNode.node.number}/files?per_page=300`
          )
          .reply(200, changes)
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${prNode.node.potentialMergeCommit.oid}`
          )
          .reply(200, makeCommitPage(changes[0]))

        const octokit = github.getOctokit('justafaketoken')
        const changed = await checkPullRequestForMergeChanges(octokit, github.context, prNode)

        expect(changed).toBe(true)
      })

      it('returns yes when a sha is different', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${prNode.node.number}/files?per_page=300`
          )
          .reply(200, [changes[0]])
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${prNode.node.potentialMergeCommit.oid}`
          )
          .reply(200, makeCommitPage(changes[1]))

        const octokit = github.getOctokit('justafaketoken')
        const changed = await checkPullRequestForMergeChanges(octokit, github.context, prNode)

        expect(changed).toBe(true)
      })

      it('returns no when everythign matches', async () => {
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${prNode.node.number}/files?per_page=300`
          )
          .reply(200, changes)
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${prNode.node.potentialMergeCommit.oid}`
          )
          .reply(200, makeCommitPage(...changes))

        const octokit = github.getOctokit('justafaketoken')
        const changed = await checkPullRequestForMergeChanges(octokit, github.context, prNode)

        expect(changed).toBe(false)
      })
    })
  })

  describe('correctly determines labeling', () => {
    const expectedLabel: IGithubLabelNode = {node: {id: 'MDU6TGFiZWwyNzYwMjE1ODI0', name: 'expected_label'}}
    const makePrNode = (mergeable: string, ...label: IGithubLabelNode[]): IGithubPRNode => {
      return {
        node: {
          id: 'MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw',
          number: 7,
          mergeable: mergeable,
          potentialMergeCommit: {
            oid: '5ed0e15d4ca4ce73e847ee1f0369ee85a6e67bc9'
          },
          labels: {edges: [...label]}
        }
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

        const pullRequest: IGithubPRNode = makePrNode('CONFLICTING')
        const octokit = github.getOctokit('justafaketoken')
        const added = updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, false)

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

        const pullRequest: IGithubPRNode = makePrNode('CONFLICTING')
        const octokit = github.getOctokit('justafaketoken')
        const added = updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, false)

        await expect(added).rejects.toThrowError()
      })

      it('does nothing when already labeled', async () => {
        const pullRequest: IGithubPRNode = makePrNode('CONFLICTING', expectedLabel)

        const octokit = github.getOctokit('justafaketoken')
        const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
        await updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, false)

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

        const pullRequest: IGithubPRNode = makePrNode('MERGEABLE', expectedLabel)

        const octokit = github.getOctokit('justafaketoken')
        const removed = updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, false)

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

        const pullRequest: IGithubPRNode = makePrNode('MERGEABLE', expectedLabel)
        const octokit = github.getOctokit('justafaketoken')
        const removed = updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, false)

        await expect(removed).rejects.toThrowError()
      })

      it('does nothing when no label', async () => {
        const pullRequest: IGithubPRNode = makePrNode('MERGEABLE')

        const octokit = github.getOctokit('justafaketoken')
        const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
        await updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, false)

        expect(mockFunction).not.toBeCalled()
      })
    })

    describe('merge changes', () => {
      it('removes an old label', async () => {
        const pullRequest: IGithubPRNode = makePrNode('MERGEABLE', expectedLabel)
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${pullRequest.node.number}/files?per_page=300`
          )
          .reply(200, [
            {
              sha: 'da207b42e77f336db8f7bad825daa71726ebf649',
              filename: 'recipes/pango/all/conanfile.py',
              status: 'modified',
              patch:
                '@@ -60,7 +60,7 @@ def requirements(self):\n             self.requires("freetype/2.10.4")\n \n         if self.options.with_fontconfi...'
            }
          ])
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${pullRequest.node.potentialMergeCommit.oid}`
          )
          .reply(200, {
            sha: '7ac057b641fec3b2b4a0ccdadb2b7476faca8bf0',
            node_id: 'MDY6Q29tbWl0MjA0NjcxMjMyOjdhYzA1N2I2NDFmZWMzYjJiNGEwY2NkYWRiMmI3NDc2ZmFjYThiZjA=',
            commit: {
              author: {
                name: 'SSE4',
                email: 'tomskside@gmail.com',
                date: '2021-03-14T00:37:50Z'
              },
              committer: {
                name: 'GitHub',
                email: 'noreply@github.com',
                date: '2021-03-14T00:37:50Z'
              },
              message: 'Merge d66759bedaa040252d0ef66be5655202e324ff6c into c14910196b33ef8b99737078e284171a73418c17'
            },
            author: {
              login: 'SSE4',
              id: 870236,
              node_id: 'MDQ6VXNlcjg3MDIzNg=='
            },
            committer: {
              login: 'web-flow',
              id: 19864447,
              node_id: 'MDQ6VXNlcjE5ODY0NDQ3'
            },
            parents: [
              {
                sha: 'c14910196b33ef8b99737078e284171a73418c17'
              },
              {
                sha: 'd66759bedaa040252d0ef66be5655202e324ff6c'
              }
            ],
            files: [
              {
                sha: 'da207b42e77f336db8f7bad825daa71726ebf649',
                filename: 'recipes/pango/all/conanfile.py',
                status: 'modified',
                patch:
                  '@@ -60,7 +60,7 @@ def requirements(self):\n             self.requires("freetype/2.10.4")\n \n         if self.options.with_fontconf...'
              }
            ]
          })
          .post(
            '/graphql',
            /removeLabelsFromLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
          )
          .reply(200, {data: {}})

        const octokit = github.getOctokit('justafaketoken')
        const removed = updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, true)

        await expect(removed).resolves.toBe(undefined)
      })

      it('removes an old label', async () => {
        const pullRequest: IGithubPRNode = makePrNode('MERGEABLE', expectedLabel)
        const scope = nock('https://api.github.com', {
          reqheaders: {
            authorization: 'token justafaketoken'
          }
        })
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${pullRequest.node.number}/files?per_page=300`
          )
          .reply(200, [
            {
              sha: 'e1dde8f65c711ea3bd2a66557650a3606bf37c7f',
              filename: 'recipes/libwebp/all/conandata.yml',
              status: 'modified',
              patch:
                '@@ -5,6 +5,9 @@ sources:\n   "1.1.0":\n     url: "https://github.com/webmproject/libwebp/archive/v1.1.0.ta...'
            },
            {
              sha: '6c1a86ff50796a44a635a5267ae7322f1c3252d6',
              filename: 'recipes/libwebp/config.yml',
              status: 'modified',
              patch:
                '@@ -3,3 +3,5 @@ versions:\n     folder: all\n   "1.1.0":\n     folder: all\n+  "1.2.0":\n+    folder: all'
            }
          ])
          .get(
            `/repos/${github.context.repo.owner}/${github.context.repo.repo}/commits/${pullRequest.node.potentialMergeCommit.oid}`
          )
          .reply(200, {
            sha: 'd98404b1b9ebbc0397da93b81244511ab11867fe',
            node_id: 'MDY6Q29tbWl0MjA0NjcxMjMyOmQ5ODQwNGIxYjllYmJjMDM5N2RhOTNiODEyNDQ1MTFhYjExODY3ZmU=',
            commit: {
              author: {
                name: 'SpaceIm',
                email: '30052553+SpaceIm@users.noreply.github.com',
                date: '2021-03-13T20:07:06Z'
              },
              committer: {
                name: 'GitHub',
                email: 'noreply@github.com',
                date: '2021-03-13T20:07:06Z'
              },
              message: 'Merge 4e3af1d3e958c8ad18c374d5254a52501980432d into c14910196b33ef8b99737078e284171a73418c17'
            },
            author: {
              login: 'SpaceIm',
              id: 30052553,
              node_id: 'MDQ6VXNlcjMwMDUyNTUz'
            },
            committer: {
              login: 'web-flow',
              id: 19864447,
              node_id: 'MDQ6VXNlcjE5ODY0NDQ3'
            },
            parents: [
              {
                sha: 'c14910196b33ef8b99737078e284171a73418c17'
              },
              {
                sha: '4e3af1d3e958c8ad18c374d5254a52501980432d'
              }
            ],
            files: [
              {
                sha: 'e1dde8f65c711ea3bd2a66557650a3606bf37c7f',
                filename: 'recipes/libwebp/all/conandata.yml',
                status: 'modified',
                patch:
                  '@@ -5,6 +5,9 @@ sources:\n   "1.1.0":\n     url: "https://github.com/webmproject/libwebp/archive/v1.1.0.ta...'
              },
              {
                sha: '6c1a86ff50796a44b635a5267ae7322f1c3252d6',
                filename: 'recipes/libwebp/config.yml',
                status: 'modified',
                patch:
                  '@@ -3,3 +3,5 @@ versions:\n     folder: all\n   "1.1.0":\n     folder: all\n+  "1.2.0":\n+    folder: all'
              }
            ]
          })
          .post(
            '/graphql',
            /addLabelsToLabelable.*{labelIds: \[.*"MDU6TGFiZWwyNzYwMjE1ODI0.*\], labelableId: .*"MDExOlB1bGxSZXF1ZXN0NTc4ODgyNDUw.*"}/
          )
          .reply(200, {data: {}})

        const octokit = github.getOctokit('justafaketoken')
        const add = updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, true)

        await expect(add).resolves.toBe(undefined)
      })
    })

    it('does nothing when mergeable is unknown', async () => {
      const pullRequest: IGithubPRNode = makePrNode('UNKNOWN')

      const octokit = github.getOctokit('justafaketoken')
      const mockFunction = jest.spyOn(octokit, 'graphql').mockImplementation(jest.fn())
      await updatePullRequestConflictLabel(octokit, github.context, pullRequest, expectedLabel, false)

      expect(mockFunction).not.toBeCalled()
    })
  })

  describe('the whole sequence', () => {
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
                      id: 'MDExOlB1bGxSZXF1ZXN0NDQzNTg3NjI1',
                      number: 2109,
                      mergeable: 'UNKNOWN',
                      potentialMergeCommit: {
                        oid: 'dbe715994ec0bd51813f9e2b3e250c3e6b7dcf30'
                      },
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
                      mergeable: 'MERGEABLE',
                      potentialMergeCommit: {
                        oid: 'cdb96fa3e8b19bb280fec137bd26a8144fdabeac'
                      },
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
                      mergeable: 'CONFLICTING',
                      potentialMergeCommit: {
                        oid: 'dbe715994ec0bd51813f9e2b3e250c3e6b7dcf30'
                      },
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
                      mergeable: 'MERGEABLE',
                      potentialMergeCommit: {
                        oid: 'cdb96fa3e8b19bb280fec137bd26a8144fdabeac'
                      },
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
