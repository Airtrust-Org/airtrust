import { useState } from 'react';
import UploadDocumentos from './UploadDocumentos';
import ListaDocumentos from './ListaDocumentos';

export default function AbaDocumentos({ funcionarioId }: any) {
  const [refresh, setRefresh] = useState(0);
  
  return (
    <div className="space-y-6">
      <UploadDocumentos 
        funcionarioId={funcionarioId}
        onUploadCompleto={() => setRefresh(prev => prev + 1)}
      />
      
      <ListaDocumentos key={refresh} funcionarioId={funcionarioId} />
    </div>
  );
}
