/**
 * Backend product-type values vs the labels the UI shows.
 *
 * The MoonFive design surfaces "EVSE" for the charger product line. The
 * database column still stores the canonical "CHARGER" string (constraint
 * lives in schema.sql), so all writes/reads use the backend value and only
 * the display layer translates.
 */
export const PRODUCT_TYPES = ['AEMS', 'BEMS', 'CHARGER', 'NETWORKING'];

export const PRODUCT_LABEL = {
  AEMS: 'AEMS',
  BEMS: 'BEMS',
  CHARGER: 'EVSE',
  NETWORKING: 'NETWORKING',
};

export const PRODUCT_DESC = {
  AEMS: 'Adaptive energy mgmt',
  BEMS: 'Building energy mgmt',
  CHARGER: 'Charger unit',
  NETWORKING: 'Networking gear',
};

export function labelFor(productType) {
  return PRODUCT_LABEL[productType] || productType || '';
}
