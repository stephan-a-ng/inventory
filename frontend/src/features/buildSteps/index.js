/**
 * buildSteps slice — admin authoring of per-revision build steps + firmware
 * versions, plus (Phase C) the worker walkthrough.
 *
 * Public surface:
 * - RevisionsPanel, FirmwareVersionsPanel, BuildStepsPanel: Settings tabs
 */
export { default as RevisionsPanel } from './components/RevisionsPanel';
export { default as FirmwareVersionsPanel } from './components/FirmwareVersionsPanel';
export { default as BuildStepsPanel } from './components/BuildStepsPanel';
