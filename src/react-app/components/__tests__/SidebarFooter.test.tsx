import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { readServedFrontendVersionFromDocument } = vi.hoisted(() => ({
  readServedFrontendVersionFromDocument: vi.fn(),
}));

vi.mock('@/react-app/config/deployment', () => ({
  DEPLOYMENT_VERSION: 'deploy-fallback-version',
  readServedFrontendVersionFromDocument,
}));

import SidebarFooter from '../SidebarFooter';

describe('SidebarFooter', () => {
  afterEach(() => {
    readServedFrontendVersionFromDocument.mockReset();
  });

  it('prefere a versao realmente servida no documento', () => {
    readServedFrontendVersionFromDocument.mockReturnValue('served-version');

    render(<SidebarFooter />);

    expect(screen.getByText('AirTrust · Front served-version')).toBeInTheDocument();
  });

  it('usa a versao de fallback quando o documento nao expõe meta version', () => {
    readServedFrontendVersionFromDocument.mockReturnValue(null);

    render(<SidebarFooter />);

    expect(screen.getByText('AirTrust · Front deploy-fallback-version')).toBeInTheDocument();
  });
});
