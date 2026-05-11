/**
 * devices slice — list, detail, CRUD, pipeline visualization.
 *
 * Public surface:
 * - Dashboard, DeviceDetail (pages, mounted by app/App.jsx)
 * - useDeviceStore (zustand store; mostly internal, but a couple components
 *   in app/ legitimately read it)
 */
export { default as Dashboard } from './pages/Dashboard';
export { default as Devices } from './pages/Devices';
export { default as DeviceDetail } from './pages/DeviceDetail';
export { default as useDeviceStore } from './stores/deviceStore';
