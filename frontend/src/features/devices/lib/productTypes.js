/**
 * Backend product-type values vs the labels the UI shows.
 *
 * The canonical backend value for the charger product line is "EVSE" — the
 * DB CHECK constraint and ProductType enum both store it this way. (Older
 * installs that wrote "CHARGER" are migrated to "EVSE" by schema.sql on
 * startup.) Label and value are identical for now; this file stays for
 * forward compatibility if we ever want to show different copy.
 */
export const PRODUCT_TYPES = ['AEMS', 'BEMS', 'EVSE', 'NETWORKING'];

export const PRODUCT_LABEL = {
  AEMS: 'AEMS',
  BEMS: 'BEMS',
  EVSE: 'EVSE',
  NETWORKING: 'NETWORKING',
};

export const PRODUCT_DESC = {
  AEMS: 'Adaptive energy mgmt',
  BEMS: 'Building energy mgmt',
  EVSE: 'Charger unit',
  NETWORKING: 'Networking gear',
};

export function labelFor(productType) {
  return PRODUCT_LABEL[productType] || productType || '';
}
