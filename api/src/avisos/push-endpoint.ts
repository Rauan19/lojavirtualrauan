/**
 * Serviços de push dos navegadores. O servidor faz POST na URL que o
 * navegador informa; aceitar qualquer URL deixaria alguém cadastrar um
 * endereço interno (http://localhost:5432, metadados da nuvem) e usar o
 * servidor para chamá-lo. Só estes hosts, só https.
 */
const HOSTS_DE_PUSH = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Samsung, Opera
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, // Safari (iPhone, Mac)
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge legado
];

export function endpointDePushValido(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  return HOSTS_DE_PUSH.some((re) => re.test(url.hostname));
}
