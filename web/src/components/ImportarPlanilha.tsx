'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { getToken, getUser } from '@/lib/auth';

type LinhaPrevia = {
  linha: number;
  nome: string;
  codigo: string | null;
  acao: 'criar' | 'atualizar' | 'erro';
  erros: string[];
};

type Previa = {
  resumo: { criar: number; atualizar: number; erros: number };
  limite: { plano: string; maximo: number; vagas: number; passa: boolean } | null;
  colunasIgnoradas: string[];
  linhas: LinhaPrevia[];
};

type Resultado = {
  criados: number;
  atualizados: number;
  erros: { linha: number; nome: string; erro?: string }[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/** Planilha modelo: ";" e UTF-8 com BOM, que o Excel em português abre certo. */
function baixarModelo() {
  const linhas = [
    'nome;preco;preco_de;estoque;codigo;categoria;marca;descricao;fotos;peso_kg;largura_cm;altura_cm;comprimento_cm;ativo',
    'Camiseta Básica Preta;59,90;79,90;20;CAM-001;Camisetas;Minha Marca;Algodão 100%, gola careca;https://exemplo.com/foto1.jpg | https://exemplo.com/foto2.jpg;0,3;20;5;30;sim',
    'Calça Jeans Slim;149,90;;8;CAL-001;Calças;;Jeans com elastano;;0,7;30;5;40;sim',
  ];
  const blob = new Blob([`﻿${linhas.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-produtos.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function enviar<T>(arquivo: File, confirmar: boolean): Promise<T> {
  const fd = new FormData();
  fd.append('arquivo', arquivo);
  const user = getUser();
  const res = await fetch(
    `${API_URL}/admin/products/importar${confirmar ? '?confirmar=1' : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken() ?? ''}`,
        ...(user?.store?.slug ? { 'X-Store-Slug': user.store.slug } : {}),
      },
      body: fd,
    },
  );
  const corpo = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!res.ok) {
    const m = Array.isArray(corpo.message) ? corpo.message.join(', ') : corpo.message;
    throw new Error(m || 'Não foi possível ler a planilha');
  }
  return corpo as T;
}

const rotuloAcao: Record<LinhaPrevia['acao'], string> = {
  criar: 'Novo',
  atualizar: 'Atualiza',
  erro: 'Erro',
};

export function ImportarPlanilha({
  onClose,
  onImportado,
}: {
  onClose: () => void;
  onImportado: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function escolher(f: File | null) {
    setArquivo(f);
    setPrevia(null);
    setResultado(null);
    setErro('');
    if (!f) return;
    setOcupado(true);
    try {
      setPrevia(await enviar<Previa>(f, false));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (!arquivo) return;
    setOcupado(true);
    setErro('');
    try {
      setResultado(await enviar<Resultado>(arquivo, true));
      onImportado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setOcupado(false);
    }
  }

  const gravaveis = previa ? previa.resumo.criar + previa.resumo.atualizar : 0;

  return (
    <Modal
      title="Importar produtos por planilha"
      hint="Cadastre ou atualize vários produtos de uma vez com uma planilha do Excel ou do Google Planilhas."
      erro={erro}
      largura="lg"
      onClose={onClose}
    >
      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--ok)]">
            Pronto: {resultado.criados} produto{resultado.criados === 1 ? '' : 's'}{' '}
            criado{resultado.criados === 1 ? '' : 's'} e {resultado.atualizados}{' '}
            atualizado{resultado.atualizados === 1 ? '' : 's'}.
          </p>
          {resultado.erros.length ? (
            <div className="border border-[#ecd49a] bg-[#fff8e1] px-3 py-2 text-sm text-[#6b4f00]">
              <p className="font-semibold">
                {resultado.erros.length} linha{resultado.erros.length === 1 ? '' : 's'} não{' '}
                {resultado.erros.length === 1 ? 'entrou' : 'entraram'}:
              </p>
              <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                {resultado.erros.map((e) => (
                  <li key={e.linha}>
                    Linha {e.linha}
                    {e.nome ? ` (${e.nome})` : ''}: {e.erro}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end">
            <button type="button" className="btn btn-accent" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>
              <button
                type="button"
                className="font-semibold text-ink underline underline-offset-2"
                onClick={baixarModelo}
              >
                Baixe a planilha modelo
              </button>{' '}
              e preencha um produto por linha. Só <strong className="text-ink">nome</strong>{' '}
              e <strong className="text-ink">preço</strong> são obrigatórios.
            </li>
            <li>
              Produto com o mesmo <strong className="text-ink">código</strong> de
              um que já existe é atualizado; sem código, vira produto novo.
            </li>
            <li>
              Fotos: links começando com https://, separados por |. Categorias
              que não existem são criadas.
            </li>
            <li>
              Salve como <strong className="text-ink">CSV</strong> (no Excel:
              Arquivo → Salvar como → CSV) e envie abaixo.
            </li>
          </ol>

          <div>
            <label className="label" htmlFor="arquivo-planilha">
              Planilha (CSV)
            </label>
            <input
              id="arquivo-planilha"
              type="file"
              accept=".csv,text/csv"
              className="field"
              onChange={(e) => void escolher(e.target.files?.[0] ?? null)}
            />
          </div>

          {ocupado && !previa ? (
            <p className="text-sm text-muted">Lendo a planilha...</p>
          ) : null}

          {previa ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="border border-line px-2 py-2">
                  <p className="text-xl font-bold text-[var(--ok)]">{previa.resumo.criar}</p>
                  <p className="text-xs text-muted">novos</p>
                </div>
                <div className="border border-line px-2 py-2">
                  <p className="text-xl font-bold">{previa.resumo.atualizar}</p>
                  <p className="text-xs text-muted">atualizados</p>
                </div>
                <div className="border border-line px-2 py-2">
                  <p className={`text-xl font-bold ${previa.resumo.erros ? 'text-accent' : ''}`}>
                    {previa.resumo.erros}
                  </p>
                  <p className="text-xs text-muted">com erro</p>
                </div>
              </div>

              {previa.limite?.passa ? (
                <p className="border border-[#f3b3b3] bg-[#fef2f2] px-3 py-2 text-sm text-accent">
                  O plano {previa.limite.plano} permite {previa.limite.maximo}{' '}
                  produtos e sobram {previa.limite.vagas}. Tire alguns produtos
                  da planilha ou mude de plano em Configurações → Planos.
                </p>
              ) : null}
              {previa.colunasIgnoradas.length ? (
                <p className="text-xs text-muted">
                  Colunas ignoradas: {previa.colunasIgnoradas.join(', ')}
                </p>
              ) : null}

              <div className="max-h-64 overflow-auto border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#fafafa] text-left text-xs text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Linha</th>
                      <th className="px-2 py-1.5 font-semibold">Produto</th>
                      <th className="px-2 py-1.5 font-semibold">O que acontece</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.linhas.slice(0, 300).map((l) => (
                      <tr key={l.linha} className="border-t border-line align-top">
                        <td className="px-2 py-1.5 text-muted">{l.linha}</td>
                        <td className="px-2 py-1.5">
                          {l.nome || <span className="text-muted">sem nome</span>}
                          {l.codigo ? (
                            <span className="ml-1 text-xs text-muted">{l.codigo}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`text-xs font-semibold ${
                              l.acao === 'erro'
                                ? 'text-accent'
                                : l.acao === 'criar'
                                  ? 'text-[var(--ok)]'
                                  : 'text-ink'
                            }`}
                          >
                            {rotuloAcao[l.acao]}
                          </span>
                          {l.erros.length ? (
                            <span className="block text-xs text-accent">
                              {l.erros.join('; ')}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-ghost" data-modal-cancel>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={ocupado || gravaveis === 0 || Boolean(previa.limite?.passa)}
                  onClick={() => void confirmar()}
                >
                  {ocupado
                    ? 'Importando...'
                    : `Importar ${gravaveis} produto${gravaveis === 1 ? '' : 's'}`}
                </button>
              </div>
              {previa.resumo.erros > 0 && gravaveis > 0 ? (
                <p className="text-right text-xs text-muted">
                  As linhas com erro ficam de fora; dá para corrigir e enviar de
                  novo depois.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
