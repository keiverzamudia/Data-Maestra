# FASE 14I — Primer INSERT real en Profit: NO COMPLETADO (bloqueo técnico)

> Confirmación humana recibida (`CONFIRMO PRIMER INSERT REAL EN PROFIT PARA
> REQ-0055`), pero un gate técnico falló: **NO se ejecutó ningún INSERT**.
> 0 UPDATE, 0 DELETE, 0 DDL. REQ-0055 intacta (APROBADO_FINAL).

## 1. Fecha/hora

2026-09-13 (UTC). Pre-flight + hallazgo + corrección en la misma sesión.

## 2-6. Solicitud / códigos / destino / auth

- REQ-0055 CARRETA, master FERMIS-00001, candidata FERMIS0662 (libre,
  re-verificada), APROBADO_FINAL, dry-run READY (revalidado).
- Destino SRVBDPROFITBK/AD_TRANS. Flag OFF al inicio y al final.
- Método: Windows integrada **resultó inviable**: tedious v20 ignora
  `trustedConnection` (sin SSPI implícito) y NTLM exige password explícito
  (ELOGIN medido). SSMS funciona porque es otro cliente.

## 7-9. Confirmación, INSERT, resultado

- Confirmación: SÍ (humana, explícita, para REQ-0055).
- INSERT: NO EJECUTADO (bloqueo §7: sin credencial SQL de escritura).
- Resultado: BLOQUEADO, no FAILED (nada se intentó contra Profit).

## 10-14. VERIFY / workflow / auditoría / flag

Sin cambios: REQ-0055 sigue APROBADO_FINAL; sin AuditEvent nuevos de
escritura; flag OFF. Nada que reconciliar.

## 15-16. Tests / builds

- Backend 364/364 (incl. 3 nuevos fail-closed), frontend 150/150,
  `tsc` OK (ambos), `nest build` OK.
- Cambios: `profit-write.adapter.ts` (elimina fallback muerto → error
  claro), 3 tests, comentarios `.env.local`. API en ejecución aún con
  dist previo (sin impacto: flag OFF).

## 17. Bug crítico corregido (§8)

El fallback `trustedConnection` nunca autenticaba (ELOGIN silencioso).
Ahora exige credencial SQL explícita con mensaje claro. Sin refactor.

## 18. Problemas y desbloqueo exacto

Para el primer INSERT hace falta, en orden: 1) DBA crea login SQL con
`INSERT (+SELECT validación)` solo sobre lo necesario, sin UPDATE/DELETE/
DDL/admin; 2) operador configura `PROFIT_WRITE_USER/PASSWORD` (canal
seguro, jamás chat); 3) restart API + health; 4) dry-run endpoint READY;
5) nueva confirmación (la actual caduca ante el cambio); 6) flag temporal
→ revalidación → INSERT → VERIFY → OFF. No se recomienda NTLM con
password de usuario (preferir cuenta técnica).

## 19. Estado final

**PRIMER INSERT REAL NO COMPLETADO** (bloqueo técnico, sin efectos
colaterales).
