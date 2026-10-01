import { endpointDePushValido } from './push-endpoint';

describe('endpoint de push', () => {
  it('aceita os serviços dos navegadores', () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/abc:123',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
      'https://web.push.apple.com/QGx',
      'https://wns2-by3p.notify.windows.com/w/?token=x',
    ]) {
      expect(endpointDePushValido(url)).toBe(true);
    }
  });

  it('recusa endereço interno, http e host parecido', () => {
    for (const url of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://localhost/fcm',
      'https://169.254.169.254/latest/meta-data',
      'https://fcm.googleapis.com.evil.com/x',
      'https://evil.com/fcm.googleapis.com',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'nao-e-url',
    ]) {
      expect(endpointDePushValido(url)).toBe(false);
    }
  });
});
