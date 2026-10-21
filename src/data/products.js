// Mock product data matching backend Product schema (ItemsList.js)
import {
  models,
  capacities,
  colors,
  carriers,
  countries,
  simTypes,
} from './productSchema.js';

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateProducts(count = 24) {
  const products = [];
  for (let i = 0; i < count; i++) {
    const model = randomItem(
      models.filter((m) => m.startsWith('iPhone') || m.startsWith('MacBook'))
    );
    const capacity = randomItem(capacities);
    const color = randomItem(colors);
    const carrier = randomItem(carriers);
    const basePrice = model.includes('Pro Max')
      ? 799
      : model.includes('Pro')
        ? 649
        : model.includes('MacBook')
          ? 899
          : 499;
    const price = basePrice + Math.floor(Math.random() * 200) - 50;
    const country = randomItem(countries);
    const sim = randomItem(simTypes);
    const product_type = 'Smartphone';
    const product_name = `Apple ${model}`;
    const createdAt = new Date(
      Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000
    );
    products.push({
      _id: `mock-${i + 1}`,
      product_type,
      product_name,
      models: model,
      capacity,
      country,
      sim,
      carrier,
      color,
      IME: 'clean',
      images: [],
      stock: Math.floor(Math.random() * 900) + 10,
      price: (price < 400 ? 399 : price).toFixed(2),
      description: `${product_name} - ${capacity} - ${color}. Good condition.`,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });
  }
  return products.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

export const mockProducts = generateProducts(100);
