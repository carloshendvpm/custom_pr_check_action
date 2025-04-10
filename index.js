const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    core.info('Iniciando verificação de PR...');
    const token = core.getInput('github-token');
    core.info('Token obtido, inicializando octokit...');
    const octokit = github.getOctokit(token);
    
    core.info(`Contexto do evento: ${github.context.eventName}`);
    core.info(`Repositório: ${github.context.repo.owner}/${github.context.repo.repo}`);
    
    let pr;
    
    if (github.context.payload.pull_request) {
      pr = github.context.payload.pull_request;
      core.info(`Processando evento de pull request #${pr.number}`);
    } 
    else if (github.context.eventName === 'push') {
      core.info('Evento de push detectado, procurando PRs associados...');
      
      const sha = github.context.sha;
      core.info(`SHA do commit atual: ${sha}`);
      
      try {
        const { data: pullRequests } = await octokit.rest.pulls.list({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          state: 'open'
        });
        
        core.info(`Encontrados ${pullRequests.length} PRs abertos no repositório`);
        
        for (const pullRequest of pullRequests) {
          core.info(`Verificando commits do PR #${pullRequest.number}...`);
          try {
            const { data: commits } = await octokit.rest.pulls.listCommits({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              pull_number: pullRequest.number
            });
            
            core.info(`PR #${pullRequest.number} tem ${commits.length} commits`);
            
            if (commits.some(commit => commit.sha === sha)) {
              pr = pullRequest;
              core.info(`Encontrado PR #${pr.number} relacionado ao commit ${sha}`);
              break;
            }
          } catch (commitError) {
            core.warning(`Erro ao buscar commits do PR #${pullRequest.number}: ${commitError.message}`);
          }
        }
      } catch (prListError) {
        core.warning(`Erro ao listar PRs: ${prListError.message}`);
      }
    }

    // Se não encontrar um PR, encerrar
    if (!pr) {
      core.info("Nenhum PR encontrado para verificar.");
      return;
    }

    core.info('Verificando campos obrigatórios do PR...');
    const missingFields = [];

    if (!pr.milestone) {
      missingFields.push('🔹 **Milestone**');
      core.info('Milestone não encontrada');
    }

    if (!pr.assignees || pr.assignees.length === 0) {
      missingFields.push('👤 **Assignees**');
      core.info('Assignees não encontrados');
    }

    if (!pr.labels || pr.labels.length === 0) {
      missingFields.push('🏷️ **Labels**');
      core.info('Labels não encontradas');
    }

    if (missingFields.length > 0) {
      const message = `
⚠️ Neste PR estão faltando os seguintes campos obrigatórios:

${missingFields.join('\n')}

Por favor, adicione-os para manter a organização do projeto.
`;
      
      core.info('Campos obrigatórios ausentes, tentando adicionar comentário...');
      
      try {
        core.info(`Criando comentário no PR #${pr.number}`);
        core.info(`Dono do repo: ${github.context.repo.owner}`);
        core.info(`Nome do repo: ${github.context.repo.repo}`);
        
        await octokit.rest.issues.createComment({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issue_number: pr.number,
          body: message
        });
        
        core.info('Comentário adicionado com sucesso');
        core.setFailed("PR está incompleto. Veja o comentário adicionado.");
      } catch (commentError) {
        core.error(`Erro ao criar comentário: ${commentError.message}`);
        if (commentError.message.includes('Resource not accessible by integration')) {
          core.error('ERRO DE PERMISSÃO: Verifique se o token tem permissão para escrever em issues/pull requests');
          core.error('Adicione "permissions: { issues: write, pull-requests: write }" ao seu arquivo de workflow');
        }
        core.setFailed(`Não foi possível adicionar comentário: ${commentError.message}`);
      }
    } else {
      core.info(`✅ PR #${pr.number} está com todos os campos obrigatórios preenchidos.`);
    }

  } catch (error) {
    core.error(`Erro na execução da action: ${error.message}`);
    if (error.stack) {
      core.debug(`Stack trace: ${error.stack}`);
    }
    core.setFailed(error.message);
  }
}

run();
