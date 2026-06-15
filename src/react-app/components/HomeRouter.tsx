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
  const [funcionarioContext, setFuncionarioContext] =
    useState<HomeProfileFuncionarioContext | null>(null);

  useEffect(() => {
    let active = true;
    const shouldResolveFuncionarioContext = isStudentLikeHomeRole(user?.role);

    if (!shouldResolveFuncionarioContext || !user?.funcionario_id) {
      setFuncionarioContext(null);
      return () => {
        active = false;
      };
    }

    void funcionariosService
      .buscarPorId(String(user.funcionario_id))
      .then((funcionario) => {
        if (!active) return;
        setFuncionarioContext(toFuncionarioContext(funcionario));
      })
      .catch(() => {
        if (!active) return;
        setFuncionarioContext(null);
      });

    return () => {
      active = false;
    };
  }, [user?.funcionario_id, user?.role]);

  const homeProfile = useMemo(
    () => resolveHomeProfile(user, funcionarioContext),
    [funcionarioContext, user],
  );

  if (isLoading) return null;

  if (homeProfile === 'PRIMARY_ADMIN_DASHBOARD') {
    return <DashboardPrincipal />;
  }

  const homePath = resolveHomePath(homeProfile);
  if (homePath === '/funcionarios') {
    return <Navigate to={homePath} replace />;
  }

  return <HomePerfil homeProfile={homeProfile} funcionarioContext={funcionarioContext} />;
}
