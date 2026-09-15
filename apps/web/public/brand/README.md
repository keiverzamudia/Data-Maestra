# Brand — Assets oficiales SAN LUIS

Assets oficiales presentes (NO inventados, NO redibujados):

- `isologo-san-luis.svg` — isologo ancho, artwork monocromático negro.
  Uso: panel oscuro del login con clase `.brand-asset-invert` (filtro CSS
  brightness(0) invert(1) → blanco). `LoginPage.tsx` lo carga de `/brand/`
  con fallback textual si el archivo falta.
- `isologo-san-luis-azul.svg` — variante para superficies claras.
  Uso: tarjeta clara del login con clase `.brand-asset-sm` (sin filtros).

Notas:

- Ambos SVG tienen fondo transparente y relleno negro: solo son visibles
  sobre el fondo que les corresponde (oscuro con invert / claro directo).
- El favicon `DM` de `index.html` NO es el logo San Luis.
- Futuras variantes de línea (Suministros, Transporte, Hidrocarburos
  Lubricantes) y versión negativa dedicada, con estos nombres:
  `isologo-san-luis-suministros.svg`, `isologo-san-luis-transporte.svg`,
  `isologo-san-luis-hidrocarburos.svg`, `isologo-san-luis-negativo.svg`.
