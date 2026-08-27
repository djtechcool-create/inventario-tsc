# Inventario TSC

Sistema web de **control y comparación de inventarios** de bodega. App híbrida PWA que funciona en móviles (como app instalable) y en PC vía navegador. Publicada y alojada en **GitHub Pages**.

## Características principales

- **Roles**: ADMINISTRADOR (PC) y BODEGA (móvil).
- **Inventario virtual**: importación inteligente de Excel (detección automática de columnas y estados, consolidación por producto+lote, validación).
- **Contador de bodega**: el usuario BODEGA solo ve **producto y lote** y registra cantidades físicas. Nunca ve cantidades esperadas, diferencias, faltantes o sobrantes.
- **Calculadora de conteo por pallets**: 30 reglas de la sección 30 — pallets completos = sacos BUENOS automáticamente, múltiples grupos, sacos individuales por estado, cálculo 100% automático.
- **Comparación automática** por Producto + Lote + Estado:
  - CUADRADO, FALTANTE, SOBRANTE, CAMBIO DE ESTADO, NO ENCONTRADO, NO ESPERADO.
  - Distingue "total cuadrado" de "estados cuadrados": un inventario solo se concilia cuando ambas condiciones se cumplen.
- **Inventarios semanales** independientes (no se sobrescriben).
- **Reconteo**: reabrir conserva el historial del conteo anterior.
- **Conteos con auditoría**: usuario, fecha/hora de inicio y fin, última modificación.
- **Guardado de avances** y progreso visible (ej. 80/200 · 40%).
- **Dashboard** con tarjetas y métricas.
- **Reportes** y **exportación a Excel** (5 hojas: RESUMEN, DETALLE, DIFERENCIAS, CAMBIOS DE ESTADO, HISTORIAL).
- **Actualización del inventario virtual** y **conciliación final**.

## Usuarios por defecto

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | ADMINISTRADOR |

> Al crear usuarios de BODEGA se genera una contraseña temporal que deben cambiar en su primer ingreso.

## Flujo semanal

1. **Admin** sube el Excel del inventario virtual → vista previa → crear inventario (BORRADOR).
2. **Admin** crea usuarios (opcional) y asigna el inventario a los usuarios de bodega → abre el conteo (EN CONTEO).
3. **Bodega** (móvil) abre su inventario, cuenta con la calculadora de pallets/sacos, guarda avances y finaliza.
4. **Admin** revisa el reporte, la comparación automática y las diferencias.
5. **Admin** puede reabrirlo para reconteo, actualizar el inventario virtual o conciliar.

## Seguridad (importante)

Esta versión se ejecuta 100% en el navegador (GitHub Pages es un host estático).

- Los **datos se separan por rol**: las tareas que recibe BODEGA **no contienen** cantidades, saldos ni diferencias del inventario virtual.
- El **inventario virtual se guarda cifrado** (AES-256 en el navegador) y solo el módulo del administrador lo descifra en memoria.
- Contraseñas almacenadas con hash SHA-256 (no en texto plano).

**Limitación de arquitectura**: al no existir un backend real, la protección del inventario virtual depende de la interfaz y del cifrado local; no puede garantizarse contra un usuario con conocimientos técnicos que manipule la consola del navegador. Está pensado para el escenario definido (personal de bodega sin acceso técnico). Si en el futuro se requiere blindaje a nivel de servidor, conviene migrar a un backend como Firebase o Supabase (las reglas de rol harían imposible que BODEGA descifre el inventario virtual).

## Estructura

```
index.html            - App (login + vistas por rol)
css/styles.css        - Estilos (PC + móvil)
js/
  db.js               - Datos, autenticación, cifrado, permisos
  excel.js            - Importador inteligente de Excel
  compare.js          - Motor de comparación virtual vs físico
  calc.js             - Calculadora de pallets/sacos
  ui.js               - Helpers de interfaz
  app.js              - Router e inicio (login, cambio de contraseña)
  views/admin.js      - Dashboard, inventarios, usuarios, historial
  views/bodega.js     - Contador móvil (calculadora, avances, finalizar)
  views/report.js     - Reportes y exportación a Excel
vendor/xlsx.full.min.js - SheetJS (lectura/escritura Excel)
manifest.json / sw.js / icons/ - PWA (instalable, offline)
.github/workflows/deploy.yml  - Publica a GitHub Pages en cada push
```

## URL de la app

Se publica automáticamente en GitHub Pages en cada push a `main`.

## Exportación a Excel

El Excel generado incluye 5 hojas: **RESUMEN** (indicadores), **DETALLE** (todos los producto/lote), **DIFERENCIAS** (solo con novedades), **CAMBIOS DE ESTADO** (movimientos entre estados) e **HISTORIAL** (conteos, usuarios, fechas y horas).
