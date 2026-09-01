import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requestService } from '../../services';
import { PageHeader, Button } from '../../components/ui';
import { RequestDetail } from '../../components/workflow';
import type { Request } from '../../types';

export const RequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = React.useState<Request | null>(null);

  React.useEffect(() => {
    if (id) requestService.getById(id).then(r => { if (r) setRequest(r); });
  }, [id]);

  if (!request) return <div className="empty">Cargando...</div>;

  return (
    <div className="stack">
      <PageHeader
        title={`Solicitud ${request.requestNumber}`}
        action={<Button variant="secondary" onClick={() => navigate(-1)}>Volver</Button>}
      />
      <RequestDetail request={request} />
    </div>
  );
};
