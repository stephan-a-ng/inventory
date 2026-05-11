/**
 * audit slice — read-only views of the audit_log table.
 *
 * Used by the devices slice (DeviceDetail's timeline, Dashboard's activity feed)
 * via these barrel exports — never by reaching into components/.
 */
export { default as ActivityFeed } from './components/ActivityFeed';
export { default as AuditTimeline } from './components/AuditTimeline';
