import { useState } from 'react';
import { X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/react-app/components/UI/Card';
import Button from '@/react-app/components/Button';
import { AgendamentoForm } from '@/react-app/components/forms/AgendamentoForm';
import { toast } from 'sonner';

interface AgendamentoModalProps {
  open: boolean;
  onClose: () => void;
  initialData?: Record<string, unknown>;
  onSave?: (data: Record<string, unknown>) => Promise<void>;
}

export function AgendamentoModal({ open, onClose, initialData, onSave }: AgendamentoModalProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      setLoading(true);
      if (onSave) {
        await onSave(data);
      }
      toast.success(initialData ? 'Agendamento atualizado!' : 'Agendamento criado!');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar agendamento';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{initialData ? 'Editar Agendamento' : 'Novo Agendamento'}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X size={18} />
          </Button>
        </CardHeader>

        <CardContent>
          <AgendamentoForm onSubmit={handleSubmit} initialData={initialData} isLoading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
