/*
 * Testes de lógica pura do front (src/lib). Componente e página são
 * verificados no navegador; o que entra aqui é regra de negócio — cálculo de
 * parcela, formatação de documento, carrinho — que precisa de rede de
 * segurança e roda em milissegundos.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
