# PDM-2026-SECRETARIA-DE-FAMILIA
PLAN DE DESARROLLO 2026 — Secretaría de Familia

## Dashboard Editable con Actualización en Tiempo Real

Este proyecto contiene un dashboard web para el seguimiento del Plan de Desarrollo Municipal 2026 de la Secretaría de Familia. El dashboard es completamente editable desde el navegador y se actualiza automáticamente cuando el archivo de datos es modificado.

### Características
- 📊 **Indicadores clave** (KPI) con barras de progreso
- 📋 **Tabla de programas** editable directamente en la interfaz
- 📰 **Novedades** con posibilidad de agregar y eliminar
- 🔄 **Actualización en tiempo real** vía Server-Sent Events (SSE) cuando `data/dashboard-data.json` cambia
- 💾 **Guardado persistente** — los cambios se escriben al archivo JSON en el servidor

### Requisitos
- Node.js 18 o superior

### Instalación y Ejecución

```bash
npm install
npm start
```

Luego abrir http://localhost:3000 en el navegador.

### Editar datos directamente
Los datos del dashboard se encuentran en `data/dashboard-data.json`. Al modificar y guardar ese archivo (externamente o desde la UI), el dashboard se actualiza automáticamente en todos los navegadores conectados.

### Puerto
El servidor usa el puerto `3000` por defecto. Se puede cambiar con la variable de entorno `PORT`:
```bash
PORT=8080 npm start
```
