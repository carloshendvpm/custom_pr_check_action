const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);
    
    let pr;
    
    if (github.context.payload.pull_request) {
      pr = github.context.payload.pull_request;
      core.info(`Processando evento de pull request #${pr.number}`);
    } 
    else if (github.context.eventName === 'push') {
      core.info('Evento de push detectado, procurando PRs associados...');
      
      const sha = github.context.sha;
      
      const { data: pullRequests } = await octokit.rest.pulls.list({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        state: 'open'
      });
      for (const pullRequest of pullRequests) {
        const { data: commits } = await octokit.rest.pulls.listCommits({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          pull_number: pullRequest.number
        });
        
        if (commits.some(commit => commit.sha === sha)) {
          pr = pullRequest;
          core.info(`Encontrado PR #${pr.number} relacionado ao commit ${sha}`);
          break;
        }
      }
    }

    // Se não encontrar um PR, encerrar
    if (!pr) {
      core.info("Nenhum PR encontrado para verificar.");
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
