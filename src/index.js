const core = require('@actions/core');
const github = require('@actions/github');
const { messages } = require('../lib/constants');


async function run() {
  try {
    core.info('Starting PR check...');
    const token = core.getInput('github-token');
    const customToken = core.getInput('custom-token') || token;
    const language = core.getInput('language') || 'pt';
    const msgTexts = messages[language] || messages.pt;
    
    core.info('Token obtained, initializing octokit...');
    const octokit = github.getOctokit(token);
    const commentOctokit = customToken !== token ? github.getOctokit(customToken) : octokit;    
    core.info(`Event context: ${github.context.eventName}`);
    core.info(`Repository: ${github.context.repo.owner}/${github.context.repo.repo}`);
    
    let pr;
    
    if (github.context.payload.pull_request) {
      pr = github.context.payload.pull_request;
      core.info(`Processing pull request #${pr.number}`);
    } 
    else if (github.context.eventName === 'push') {
      core.info('Push event detected, searching for associated PRs...');
      
      const sha = github.context.sha;
      core.info(`Current commit SHA: ${sha}`);
      
      try {
        const { data: pullRequests } = await octokit.rest.pulls.list({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          state: 'open'
        });
        
        core.info(`Found ${pullRequests.length} open PRs in the repository`);
        
        for (const pullRequest of pullRequests) {
          core.info(`Checking commits of PR #${pullRequest.number}...`);
          try {
            const { data: commits } = await octokit.rest.pulls.listCommits({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              pull_number: pullRequest.number
            });
            
            core.info(`PR #${pullRequest.number} has ${commits.length} commits`);
            
            if (commits.some(commit => commit.sha === sha)) {
              pr = pullRequest;
              core.info(`Found PR #${pr.number} related to commit ${sha}`);
              break;
            }
          } catch (commitError) {
            core.warning(`Error searching commits for PR #${pullRequest.number}: ${commitError.message}`);
          }
        }
      } catch (prListError) {
        core.warning(`Erro ao listar PRs: ${prListError.message}`);
      }
    }

    if (!pr) {
      core.info("No PR found to verify.");
      return;
    }

    core.info('Verifying required PR fields...');
    const missingFields = [];

    if (!pr.milestone) {
      missingFields.push(msgTexts.milestoneMissing);
      core.info('Milestone not found');
    }

    if (!pr.assignees || pr.assignees.length === 0) {
      missingFields.push(msgTexts.assigneesMissing);
      core.info('Assignees not found');
    }

    if (!pr.labels || pr.labels.length === 0) {
      missingFields.push(msgTexts.labelsMissing);
      core.info('Labels not found');
    }

    if (missingFields.length > 0) {
      const message = `
## ⚠️ ${msgTexts.title}

${msgTexts.intro}

${missingFields.join('\n')}

---

### 📝 ${msgTexts.importance}
- **Milestones** ${msgTexts.milestoneImportance}
- **Assignees** ${msgTexts.assigneesImportance}
- **Labels** ${msgTexts.labelsImportance}

### 🚀 ${msgTexts.howToResolve}
1. ${msgTexts.step1}
2. ${msgTexts.step2}
3. ${msgTexts.step3}

---
_${msgTexts.footer}_
`;
      
      core.info('Missing required fields, trying to add comment...');
      
      try {
        core.info(`Creating comment on PR #${pr.number}`);
        core.info(`Repository owner: ${github.context.repo.owner}`);
        core.info(`Repository name: ${github.context.repo.repo}`);
        
        await commentOctokit.rest.issues.createComment({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issue_number: pr.number,
          body: message
        });
        
        core.info('Comment added successfully');
        core.setFailed("PR is incomplete. See the added comment.");
      } catch (commentError) {
        core.error(`Error creating comment: ${commentError.message}`);
        if (commentError.message.includes('Resource not accessible by integration')) {
          core.error('PERMISSION ERROR: Check if the token has permission to write in issues/pull requests');
          core.error('Add "permissions: { issues: write, pull-requests: write }" to your workflow file');
        }
        core.setFailed(`Unable to add comment: ${commentError.message}`);
      }
    } else {
      core.info(`✅ PR #${pr.number} has all required fields filled.`);
    }

  } catch (error) {
    core.error(`Error executing action: ${error.message}`);
    if (error.stack) {
      core.debug(`Stack trace: ${error.stack}`);
    }
    core.setFailed(error.message);
  }
}

run();
