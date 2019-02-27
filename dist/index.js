"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const actions_toolkit_1 = require("actions-toolkit");
const queries_1 = require("./lib/queries");
const util_1 = require("./lib/util");
const tools = new actions_toolkit_1.Toolkit({
    event: ['pull_request.closed']
});
const conflictLabelName = process.env['CONFLICT_LABEL_NAME'];
(async () => {
    // check configuration
    if (!conflictLabelName) {
        tools.exit.failure('Please set environment variable CONFLICT_LABEL_NAME');
    }
    // only run on actual merges
    if (tools.context.payload.pull_request &&
        !tools.context.payload.pull_request.merged) {
        tools.exit.neutral('PR was closed but not merged');
    }
    let result;
    try {
        result = await queries_1.getPullRequestsAndLabels(tools, tools.context.repo());
    }
    catch (error) {
        tools.exit.failure('getPullRequestsAndLabels request failed');
    }
    let conflictLabel = result.repository.labels.edges.find((label) => {
        return label.node.name === conflictLabelName;
    });
    if (!conflictLabel) {
        tools.exit.failure(`"${conflictLabelName}" label not found in your repository!`);
    }
    // check if there are PRs with unknown mergeable status
    let pullrequestsWithoutMergeStatus;
    pullrequestsWithoutMergeStatus = util_1.getPullrequestsWithoutMergeStatus(result.repository.pullRequests.edges);
    // wait and retry
    if (pullrequestsWithoutMergeStatus.length > 0) {
        tools.log.info(`...waiting for mergeable info...`);
        await util_1.wait(5000);
        try {
            result = await queries_1.getPullRequestsAndLabels(tools, tools.context.repo());
        }
        catch (error) {
            tools.exit.failure('getPullRequestsAndLabels request failed');
        }
    }
    pullrequestsWithoutMergeStatus = util_1.getPullrequestsWithoutMergeStatus(result.repository.pullRequests.edges);
    if (pullrequestsWithoutMergeStatus.length > 0) {
        tools.exit.failure('Cannot determine mergeable status!');
    }
    let pullrequestsWithConflicts;
    pullrequestsWithConflicts = result.repository.pullRequests.edges.filter((pullrequest) => {
        return pullrequest.node.mergeable === 'CONFLICTING';
    });
    if (pullrequestsWithConflicts.length > 0) {
        pullrequestsWithConflicts.forEach(async (pullrequest) => {
            const isAlreadyLabeled = pullrequest.node.labels.edges.find((label) => {
                return label.node.id === conflictLabel.node.id;
            });
            if (isAlreadyLabeled) {
                tools.log.info(`Skipping PR #${pullrequest.node.number}, it has conflicts but is already labeled`);
            }
            else {
                tools.log.info(`Labeling PR #${pullrequest.node.number}`);
                try {
                    await queries_1.addLabelsToLabelable(tools, {
                        labelIds: conflictLabel.node.id,
                        labelableId: pullrequest.node.id
                    });
                }
                catch (error) {
                    tools.exit.failure('addLabelsToLabelable request failed');
                }
            }
        });
    }
    else {
        // nothing to do
        tools.exit.success('No PR has conflicts, congrats!');
    }
})();
