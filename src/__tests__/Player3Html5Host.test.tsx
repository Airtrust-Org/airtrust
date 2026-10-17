import React from 'react';
import { describe, expect, it, vi } from 'vitest';
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

  it('shows AirTrust official exam only on explicit server-pinned prop, not in preview',()=>{
    const pendingAssessment={
      context:{
        empresaId:6,matriculaId:911,cicloId:800,
        editionSha256:'a'.repeat(64),stageId:'mod-1',title:'Módulo 1',
        questions:[{id:'q1',prompt:'O que fazer?',options:[
          {id:'a',text:'Verificar segurança'},{id:'b',text:'Ignorar'},
        ]}],
      },
      submitOfficialAttempt:vi.fn(),onVerifiedStagePassed:vi.fn(),onDismiss:vi.fn(),
    };
    const {rerender}=render(<Player3Html5Host {...props}
      reviewOnly={true} pendingAssessment={pendingAssessment}/>);
    expect(screen.queryByRole('dialog',{name:/Avaliação AirTrust/})).toBeNull();
    rerender(<Player3Html5Host {...props}
      reviewOnly={false} pendingAssessment={pendingAssessment}/>);
    expect(screen.getByRole('dialog',{name:/Avaliação AirTrust/})).toBeInTheDocument();
    expect(screen.getByTitle(/Conteúdo original/)).toHaveAttribute('src',props.contentUrl);
    expect(screen.queryByText(/Treinamento concluído pelo servidor/)).toBeNull();
  });

  it('does not open an official exam when untrusted HTML5 posts a module completion',()=>{
    render(<Player3Html5Host {...props} reviewOnly={false}/>);
    window.dispatchEvent(new MessageEvent('message',{
      origin:new URL(props.contentOrigin).origin,
      data:{type:'AIRTRUST_SCORM_MODULE_COMPLETED',passed:true,score:100},
    }));
    expect(screen.queryByRole('dialog',{name:/Avaliação AirTrust/})).toBeNull();
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
