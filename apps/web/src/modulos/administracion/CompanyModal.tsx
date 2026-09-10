import * as React from 'react';
import { Button, Input, Alert, Field } from '../../componentes/ui';
import { apiOrganizacionService } from '../../servicios/api/api-organizacion-service';
import type { Company } from '../../tipos';

interface Props {
  company: Company | null;
  empresas: Company[];
  onClose: () => void;
  onSaved: () => void;
}

/** 12I — Crear/editar empresa. El id jamás cambia; todo apunta al mismo companyId. */
export const CompanyModal: React.FC<Props> = ({ company, empresas, onClose, onSaved }) => {
  const [name, setName] = React.useState(company?.name ?? '');
  const [code, setCode] = React.useState(company?.code ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    if (name.trim().length < 2 || code.trim().length < 2) {
      setError('Nombre y código requieren mínimo 2 caracteres.');
      return;
    }
    const dupe = empresas.some(c => c.code.toUpperCase() === code.trim().toUpperCase() && c.id !== company?.id);
    if (dupe) {
      setError('Ya existe una empresa con ese código.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (company) {
        await apiOrganizacionService.actualizarEmpresa(company.id, { name: name.trim(), code: code.trim() });
      } else {
        await apiOrganizacionService.crearEmpresa({ name: name.trim(), code: code.trim() });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la empresa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-sm">
      <Field label="Nombre de la empresa" required>
        <Input value={name} onChange={e => setName(e.target.value)} disabled={saving} aria-label="Nombre de la empresa" placeholder="Distribuidora Central" />
      </Field>
      <Field label="Código" required helper="Identidad corta. Debe ser único.">
        <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} disabled={saving} aria-label="Código de la empresa" placeholder="EMP-CEN" />
      </Field>
      {company && <p className="muted small">Editar el nombre no crea una empresa nueva: usuarios, departamentos y solicitudes históricas conservan el mismo identificador.</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : company ? 'Guardar cambios' : 'Crear empresa'}</Button>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
      </div>
    </div>
  );
};
