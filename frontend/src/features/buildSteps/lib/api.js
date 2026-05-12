/**
 * Build-steps slice API wrappers. Thin layer over authFetch; throws on !ok.
 */
import { authFetch } from '@/shared/lib/api';

async function call(url, init) {
  const res = await authFetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {/* response wasn't JSON */}
    const err = new Error(`${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

const jsonInit = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

// ── product revisions ──────────────────────────────────────────────────────
export const listRevisions = (productType) =>
  call(`/api/product-revisions${productType ? `?product_type=${productType}` : ''}`);

export const createRevision = (data) =>
  call('/api/product-revisions', jsonInit('POST', data));

export const updateRevision = (id, patch) =>
  call(`/api/product-revisions/${id}`, jsonInit('PATCH', patch));

export const setRevisionDefault = (id) =>
  call(`/api/product-revisions/${id}/set-default`, { method: 'POST' });

export const deleteRevision = (id) =>
  call(`/api/product-revisions/${id}`, { method: 'DELETE' });

// ── firmware versions ──────────────────────────────────────────────────────
export const listFirmware = (revisionId) =>
  call(`/api/product-revisions/${revisionId}/firmware-versions`);

export const createFirmware = (revisionId, data) =>
  call(`/api/product-revisions/${revisionId}/firmware-versions`, jsonInit('POST', data));

export const updateFirmware = (id, patch) =>
  call(`/api/firmware-versions/${id}`, jsonInit('PATCH', patch));

export const setFirmwareStandard = (id) =>
  call(`/api/firmware-versions/${id}/set-standard`, { method: 'POST' });

export const deleteFirmware = (id) =>
  call(`/api/firmware-versions/${id}`, { method: 'DELETE' });

// ── instruction sets ───────────────────────────────────────────────────────
export const listInstructionSets = (revisionId, stageKey) =>
  call(`/api/instruction-sets?product_revision_id=${revisionId}${stageKey ? `&stage_key=${stageKey}` : ''}`);

export const createInstructionSet = (data) =>
  call('/api/instruction-sets', jsonInit('POST', data));

export const cloneInstructionSet = (setId, label, activate = true) =>
  call(`/api/instruction-sets/${setId}/clone`, jsonInit('POST', { label, activate }));

export const activateInstructionSet = (setId) =>
  call(`/api/instruction-sets/${setId}/activate`, { method: 'POST' });

export const updateInstructionSet = (setId, patch) =>
  call(`/api/instruction-sets/${setId}`, jsonInit('PATCH', patch));

export const deleteInstructionSet = (setId) =>
  call(`/api/instruction-sets/${setId}`, { method: 'DELETE' });

// ── build steps ────────────────────────────────────────────────────────────
export const listBuildSteps = (instructionSetId) =>
  call(`/api/build-steps?instruction_set_id=${instructionSetId}`);

export const createBuildStep = (data) =>
  call('/api/build-steps', jsonInit('POST', data));

export const updateBuildStep = (id, patch) =>
  call(`/api/build-steps/${id}`, jsonInit('PATCH', patch));

export const deleteBuildStep = (id) =>
  call(`/api/build-steps/${id}`, { method: 'DELETE' });

export const reorderBuildSteps = (ids) =>
  call('/api/build-steps/reorder', jsonInit('POST', { ids }));

// ── sub-steps ──────────────────────────────────────────────────────────────
export const listSubSteps = (stepId) =>
  call(`/api/build-steps/${stepId}/sub-steps`);

export const createSubStep = (stepId, data) =>
  call(`/api/build-steps/${stepId}/sub-steps`, jsonInit('POST', data));

export const updateSubStep = (subId, patch) =>
  call(`/api/build-sub-steps/${subId}`, jsonInit('PATCH', patch));

export const deleteSubStep = (subId) =>
  call(`/api/build-sub-steps/${subId}`, { method: 'DELETE' });

export const reorderSubSteps = (ids) =>
  call('/api/build-sub-steps/reorder', jsonInit('POST', { ids }));

// ── worker view + actions ──────────────────────────────────────────────────
export const getWorkerView = (deviceId, stageKey) =>
  call(`/api/devices/${deviceId}/stages/${stageKey}/build-steps`);

export const toggleStep = (deviceId, stepId, checked) =>
  call(`/api/devices/${deviceId}/build-steps/${stepId}/toggle`, jsonInit('POST', { checked }));

// Photo upload uses FormData; callers pass a Blob.
export async function uploadDevicePhoto(deviceId, stepId, blob, filename = 'photo.jpg') {
  const fd = new FormData();
  fd.append('file', blob, filename);
  return call(`/api/devices/${deviceId}/build-steps/${stepId}/photos`, { method: 'POST', body: fd });
}

export const deleteDevicePhoto = (deviceId, photoId) =>
  call(`/api/devices/${deviceId}/build-step-photos/${photoId}`, { method: 'DELETE' });
