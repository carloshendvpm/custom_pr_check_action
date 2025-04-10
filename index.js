import { core } from '@actions/core';
import { github } from '@actions/github';

async function run() {
  try {
    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);
    const pr = github.context.payload.pull_request;

    if (!pr) {
      core.info("Este workflow deve ser executado em eventos de pull request.");
      return;
    }

    const missingFields = [];

    if (!pr.milestone) {
      missingFields.push('🔹 **Milestone**');
    }

    if (!pr.assignees || pr.assignees.length === 0) {
      missingFields.push('👤 **Assignees**');
    }

    if (!pr.labels || pr.labels.length === 0) {
      missingFields.push('🏷️ **Labels**');
    }

    if (missingFields.length > 0) {
      const message = `
⚠️ Neste PR estão faltando os seguintes campos obrigatórios:

${missingFields.join('\n')}

Por favor, adicione-os para manter a organização do projeto.
`;

      await octokit.rest.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pr.number,
        body: message
      });

      core.setFailed("PR está incompleto. Veja o comentário adicionado.");
    } else {
      core.info(`✅ PR #${pr.number} está com todos os campos obrigatórios preenchidos.`);
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
