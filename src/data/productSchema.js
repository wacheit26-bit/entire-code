// Options aligned exactly with backend ItemsList.js schema

// product_type enum
export const productTypes = ['Smartphone', 'tablet', 'laptop', 'accessory', 'other'];

// sim enum — must match backend enum exactly
export const simTypes = ['Physical SIM', 'eSIM'];

// Static options (no backend enum restriction — free text stored)
export const capacities = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

export const colors = [
  'Space Gray',
  'Midnight',
  'Starlight',
  'Blue',
  'Green',
  'Black',
  'White',
  'Gold',
  'Silver',
  'Purple',
  'Red',
  'Pink',
];

export const countries = ['USA', 'CANADA', 'CHINA'];

// Legacy exports expected by products.js generator
export const models = [
  'iPhone 13',
  'iPhone 13 Pro',
  'iPhone 13 Pro Max',
  'iPhone 14',
  'iPhone 14 Pro',
  'iPhone 14 Pro Max',
  'MacBook Air M1',
  'MacBook Air M2',
  'MacBook Pro 14',
  'MacBook Pro 16',
];

export const carriers = ['Unlocked', 'AT&T', 'T-Mobile', 'Verizon'];
