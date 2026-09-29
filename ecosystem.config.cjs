/**
 * PM2 no VPS: sobe a API (Nest) e o site (Next) e reinicia se cair.
 *
 *   pm2 start ecosystem.config.cjs     # primeira vez
 *   pm2 reload ecosystem.config.cjs    # depois de cada deploy
 *   pm2 save && pm2 startup            # volta sozinho quando o VPS reiniciar
 *
 * A API roda com UMA instância, em modo fork, de propósito. Ela tem rotinas
 * internas (cobrança da mensalidade, expirar pedido, rastreio) e o limite de
 * tentativas de login em memória: com cluster/várias instâncias, a cobrança
 * e os e-mails saem duplicados e o limite de login vale por instância. Para
 * passar de 1 instância, primeiro é preciso Redis (ver conversa sobre BullMQ).
 */
module.exports = {
  apps: [
    {
      name: 'vendira-api',
      // cwd importa: o .env e a pasta uploads/ são lidos a partir daqui
      cwd: './api',
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
      // Dá tempo de terminar a rotina em andamento antes de matar o processo
      kill_timeout: 10000,
      time: true,
    },
    {
      name: 'vendira-web',
      cwd: './web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
      time: true,
    },
  ],
};
