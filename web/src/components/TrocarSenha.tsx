'use client';

import { FormEvent, useState } from 'react';
import { api, type AuthUser } from '@/lib/api';
import { getToken, saveSession } from '@/lib/auth';
import { PasswordField } from '@/components/StoreAuthShell';

/**
 * Troca de senha com a sessão aberta, sem e-mail. Obrigatória para quem
 * entrou com senha provisória; a troca derruba as outras sessões, então a
 * resposta traz uma sessão nova, que já fica salva.
 */
export function TrocarSenha({
  obrigatoria = false,
  onTrocada,
}: {
  obrigatoria?: boolean;
  onTrocada: () => void;
}) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    if (nova.length < 8) {
      setErro('A senha nova precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (nova !== repetir) {
      setErro('As duas senhas novas não são iguais.');
      return;
    }
    setOcupado(true);
    try {
      const r = await api<{ accessToken: string; user: AuthUser }>(
        '/auth/trocar-senha',
        { token: getToken(), method: 'POST', body: { atual, nova } },
      );
      saveSession(r.accessToken, r.user);
      setAtual('');
      setNova('');
      setRepetir('');
      setOk(
        'Senha trocada. As outras sessões abertas com a senha antiga saíram.',
      );
      onTrocada();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível trocar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="max-w-md space-y-3">
      <PasswordField
        label={
          obrigatoria ? 'Senha provisória (a que você recebeu)' : 'Senha atual'
        }
        value={atual}
        onChange={setAtual}
        autoComplete="current-password"
        required
      />
      <PasswordField
        label="Senha nova"
        value={nova}
        onChange={setNova}
        autoComplete="new-password"
        minLength={8}
        required
        hint="Pelo menos 8 caracteres. Só você vai saber."
      />
      <PasswordField
        label="Repita a senha nova"
        value={repetir}
        onChange={setRepetir}
        autoComplete="new-password"
        minLength={8}
        required
      />
      {erro ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {erro}
        </p>
      ) : null}
      {ok ? <p className="text-sm text-[#166534]">{ok}</p> : null}
      <button className="btn btn-accent" disabled={ocupado}>
        {ocupado ? 'Trocando…' : 'Trocar senha'}
      </button>
    </form>
  );
}
