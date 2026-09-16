// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NAV, visibleNav, navMatches, GROUP_LABEL } from './navigation';
import { etapaActual } from '../../utilidades/presentacion';

const KNOWN_PERMS = new Set([
  'DASHBOARD.VIEW', 'REQUEST.VIEW', 'REQUEST.CREATE', 'MANAGER.APPROVE',
  'WAREHOUSE.VIEW', 'WAREHOUSE.CLASSIFY',
  // 15A — permisos del Encargado de Almacén (contrato backend seed/backfill).
  'WAREHOUSE_MANAGER.VIEW', 'WAREHOUSE_MANAGER.APPROVE',
  'ACCOUNTING.VIEW', 'ACCOUNTING.APPROVE',
  // 16A — permiso de revisión final eliminado del flujo.
  'PROFIT.WRITE', 'IMPORT.VIEW', 'IMPORT.RUN',
  'ADMIN.MANAGE', 'AUDIT.VIEW',
]);

describe('navegación 14G', () => {
  it('grupos Operación/Trabajo/Administración con entradas esperadas', () => {
    const labels: string[] = [];
    for (const n of NAV) {
      labels.push(n.label);
      for (const c of n.children ?? []) labels.push(c.label);
    }
    for (const l of ['Dashboard Gerencial', 'Mis solicitudes', 'Crear solicitud', 'Aprobaciones', 'Almacén',
      'Aprobación Almacén', 'Contabilidad', 'Catálogos Profit']) {
      expect(labels).toContain(l);
    }
    expect(GROUP_LABEL.operacion).toBe('Operación');
    const groups = new Set(NAV.map(n => n.group));
    expect(groups).toEqual(new Set(['operacion', 'trabajo', 'administracion']));
  });

  it('Crear solicitud aparece una sola vez (14H §3)', () => {
    const labels: string[] = [];
    for (const n of NAV) {
      labels.push(n.label);
      for (const c of n.children ?? []) labels.push(c.label);
    }
    expect(labels.filter(l => l === 'Crear solicitud')).toHaveLength(1);
  });

  it('solo usa permisos existentes (ninguno inventado)', () => {
    const perms: string[] = [];
    for (const n of NAV) {
      if (n.permission) perms.push(n.permission);
      for (const c of n.children ?? []) perms.push(c.permission);
    }
    expect(perms.length).toBeGreaterThan(0);
    for (const p of perms) expect(KNOWN_PERMS.has(p)).toBe(true);
  });

  it('16A — sin Validación Maestra, Aprobación Final ni Profit standalone', () => {
    const labels: string[] = [];
    const keys: string[] = [];
    for (const n of NAV) {
      labels.push(n.label);
      keys.push(n.key);
      for (const c of n.children ?? []) { labels.push(c.label); keys.push(c.key); }
    }
    for (const l of ['Validación Maestra', 'Aprobación Final', 'Registro en Profit', 'Registro Profit']) {
      expect(labels).not.toContain(l);
    }
    for (const k of ['master-review', 'final-approval', 'profit-registry']) {
      expect(keys).not.toContain(k);
    }
    expect(labels).toContain('Contabilidad');
    expect(labels).toContain('Aprobación Almacén');
  });

  it('Catálogos Profit vive en Administración con ADMIN.MANAGE (CAT)', () => {
    const admin = NAV.find(n => n.key === 'admin')!;
    const child = (admin.children ?? []).find(c => c.key === 'admin-catalogos')!;
    expect(child.to).toBe('/admin/catalogos');
    expect(child.permission).toBe('ADMIN.MANAGE');
    const visible = visibleNav(p => p === 'ADMIN.MANAGE');
    const adminVisible = visible.find(n => n.key === 'admin')!;
    expect((adminVisible.children ?? []).map(c => c.key)).toContain('admin-catalogos');
    const outsider = visibleNav(() => false);
    expect(outsider).toEqual([]);
  });

  it('Aprobación Almacén solo visible con WAREHOUSE_MANAGER.VIEW (15A)', () => {
    const labels: string[] = [];
    for (const n of NAV) {
      labels.push(n.label);
      for (const c of n.children ?? []) labels.push(c.label);
    }
    expect(labels).toContain('Aprobación Almacén');
    const onlyMgr = visibleNav(p => p === 'WAREHOUSE_MANAGER.VIEW');
    expect(onlyMgr.map(n => n.key)).toEqual(['warehouse-approval']);
    const whOnly = visibleNav(p => p === 'WAREHOUSE.VIEW');
    expect(whOnly.map(n => n.key)).not.toContain('warehouse-approval');
  });

  it('navMatches resuelve alias legacy y detalle', () => {
    const mis = NAV.find(n => n.key === 'solicitudes')!;
    expect(navMatches(mis, '/solicitudes')).toBe(true);
    expect(navMatches(mis, '/requester')).toBe(true);
    expect(navMatches(mis, '/requester/REQ-1')).toBe(true);
    const acc = NAV.find(n => n.key === 'accounting')!;
    expect(navMatches(acc, '/accounting')).toBe(true);
  });

  it('etapaActual deriva del estado real', () => {
    expect(etapaActual('PENDIENTE_ALMACEN')).toBe('Almacén');
    expect(etapaActual('CONTABILIDAD_APROBADA')).toBe('Contabilidad');
    expect(etapaActual('INSERTADO_PROFIT')).toBe('Profit');
    expect(etapaActual('XXX')).toBe('XXX');
  });
});
