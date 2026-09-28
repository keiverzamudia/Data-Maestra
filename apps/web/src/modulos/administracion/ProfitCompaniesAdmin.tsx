import * as React from 'react';
import { Page } from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { ProfitCompaniesSection } from './ProfitCompaniesSection';

/**
 * FASE 25 — Empresas Profit para inserción (solo flags locales).
 * El descubrimiento es dinámico (TEmpresas); aquí se habilita/deshabilita
 * y se marca la estándar. Ruta protegida con ADMIN.MANAGE.
 *
 * El cuerpo vive en `ProfitCompaniesSection` para reutilizarlo dentro del
 * módulo único de Replicación Multiempresa sin duplicar lógica.
 */
export const ProfitCompaniesAdmin: React.FC = () => (
  <Page
    title="Empresas Profit"
    desc="Empresas descubiertas en Profit y su disponibilidad para inserción de artículos."
    actions={<HelpButton helpKey="empresas-profit" />}
  >
    <ProfitCompaniesSection />
  </Page>
);
