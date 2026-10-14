import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Player3Html5Host from '@/react-app/pages/lms/player3/Player3Html5Host';

const props = {
  title: 'Doutrinamento em Segurança e Qualidade',
  contentUrl: 'https://conteudo-airtrust.example/edicoes/123/content/index.html',
  contentOrigin: 'https://conteudo-airtrust.example',
  editionSha256: 'a'.repeat(64),
};

describe('Player 3 fresh isolated HTML5 host', () => {
  it('renders the original HTML5 in an isolated cross-origin frame', () => {
    render(<Player3Html5Host {...props} />);
    const frame = screen.getByTitle(/Conteúdo original/i);
    expect(frame).toHaveAttribute('src',props.contentUrl);
    expect(frame).toHaveAttribute('sandbox','allow-scripts allow-forms allow-same-origin');
    expect(frame).toHaveAttribute('referrerpolicy','no-referrer');
    expect(screen.getByText(/sem registro certificador/i)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/concluir|certificado|aprovar/i})).toBeNull();
  });

  it('fails closed on an invalid version or unapproved origin', () => {
    const {rerender} = render(<Player3Html5Host {...props} editionSha256="bad" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/origem ou edição inválida/);
    expect(screen.queryByTitle(/Conteúdo original/)).toBeNull();
    rerender(<Player3Html5Host {...props} contentOrigin="https://outro.example" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<Player3Html5Host {...props} contentUrl="javascript:alert(1)" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('rejects same-origin execution to prevent iframe sandbox breakout', () => {
    const same=window.location.origin;
    render(<Player3Html5Host {...props}
      contentOrigin={same} contentUrl={same+'/untrusted/index.html'} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ignores a client claim of completed/passed status', () => {
    render(<Player3Html5Host {...props} />);
    window.dispatchEvent(new MessageEvent('message',{
      origin:new URL(props.contentOrigin).origin,
      data:{type:'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
        payload:{status:'passed',progressPct:100,certificate:true}},
    }));
    expect(screen.getByText(/A navegação no conteúdo não confirma aprovação/))
      .toBeInTheDocument();
    expect(screen.queryByText(/Treinamento concluído pelo servidor/i)).toBeNull();
  });
});
