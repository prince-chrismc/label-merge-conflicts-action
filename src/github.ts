import { context as githubContext, getOctokit } from '@actions/github'
export type Context = typeof githubContext
export type GitHub = ReturnType<typeof getOctokit>
