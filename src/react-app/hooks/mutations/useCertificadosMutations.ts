import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';
import { certificadosKeys } from '../queries/useCertificadosRQ';

export function useCreateCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/certificados', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificadosKeys.lists() });
    },
  });
}

export function useUpdateCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/certificados/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: certificadosKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: certificadosKeys.lists() });
    },
  });
}

export function useDeleteCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/certificados/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificadosKeys.lists() });
    },
  });
}
