/**
 * Ambiente dos testes e2e. Roda antes de cada worker do Jest.
 *
 * Banco separado (`lojavirtual_test`) — os testes apagam tabelas entre os
 * casos e não podem encostar no banco de desenvolvimento.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/lojavirtual_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';
process.env.JWT_EXPIRES_IN = '1d';
// 32 bytes em hex — exercita o caminho cifrado dos tokens de gateway
process.env.ENCRYPTION_KEY =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
process.env.MP_WEBHOOK_SECRET = 'segredo-webhook-teste';
process.env.PUBLIC_URL = 'https://api.teste.local';
process.env.FRONTEND_URL = 'https://app.teste.local';
process.env.SMTP_HOST = '';
process.env.BILLING_GRACE_DAYS = '7';
// A suíte de signup faz várias chamadas na mesma hora — sem isso o rate
// limit real (5/h) travaria os próprios testes.
process.env.SIGNUP_RATE_LIMIT_PER_HOUR = '1000';
process.env.TRIAL_DAYS = '14';
