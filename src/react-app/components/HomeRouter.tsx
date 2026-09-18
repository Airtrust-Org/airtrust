import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import DashboardPrincipal from '../pages/DashboardPrincipal';
import HomePerfil from '../pages/HomePerfil';
import { funcionariosService } from '../services/funcionarios.service';
import type { Funcionario } from '../types';
import {
  isStudentLikeHomeRole,
  resolveHomePath,
  resolveHomeProfile,
  type HomeProfileFuncionarioContext,
} from '../lib/home-profile';

function toFuncionarioContext(
  funcionario: Funcionario | null | undefined,
): HomeProfileFuncionarioContext | null {
  if (!funcionario) return null;

  return {
    id: funcionario.id,
    funcao: funcionario.funcao ?? null,
    cargo: funcionario.cargo ?? null,
    setor: funcionario.setor ?? null,
    setor_id: funcionario.setor_id ?? null,
  };
}

export default function HomeRouter() {
  const { user, isLoading } = useAuth();
  const [resolvedFuncionarioContext, setResolvedFuncionarioContext] = useState<{
    funcionarioId: number;
    context: HomeProfileFuncionarioContext | null;
  } | null>(null);

  const funcionarioIdToResolve =
    isStudentLikeHomeRole(user?.role) && typeof user?.funcionario_id === 'number'
      ? user.funcionario_id
      : null;
  const funcionarioContext =
    funcionarioIdToResolve !== null &&
    resolvedFuncionarioContext?.funcionarioId === funcionarioIdToResolve
      ? resolvedFuncionarioContext.context
      : null;
  const isResolvingFuncionarioContext =
    funcionarioIdToResolve !== null &&
    resolvedFuncionarioContext?.funcionarioId !== funcionarioIdToResolve;

  useEffect(() => {
    let active = true;
    if (funcionarioIdToResolve === null) {
      setResolvedFuncionarioContext(null);
      return () => {
        active = false;
      };
    }

    void funcionariosService
      .buscarPorId(String(funcionarioIdToResolve))
      .then((funcionario) => {
        if (!active) return;
        setResolvedFuncionarioContext({
          funcionarioId: funcionarioIdToResolve,
          context: toFuncionarioContext(funcionario),
        });
      })
      .catch(() => {
        if (!active) return;
        setResolvedFuncionarioContext({
          funcionarioId: funcionarioIdToResolve,
          context: null,
        });
      });

    return () => {
      active = false;
    };
  }, [funcionarioIdToResolve]);

  const homeProfile = useMemo(
    () => resolveHomeProfile(user, funcionarioContext),
    [funcionarioContext, user],
  );

  if (isLoading || isResolvingFuncionarioContext) return null;

  if (homeProfile === 'PRIMARY_ADMIN_DASHBOARD') {
    return <DashboardPrincipal />;
  }

  const homePath = resolveHomePath(homeProfile);
  if (homePath === '/funcionarios') {
    return <Navigate to={homePath} replace />;
  }

  return <HomePerfil homeProfile={homeProfile} funcionarioContext={funcionarioContext} />;
}
