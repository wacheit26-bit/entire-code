// Mock product data matching the Stock List prototype
const manufacturers = ['Apple', 'Samsung', 'Google', 'Motorola', 'LG', 'OnePlus', 'Others'];
const models = ['iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15', 'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 12', 'iPhone 11', 'iPhone X', 'MacBook Air M1', 'MacBook Pro', 'iPad', 'Watch'];
const capacities = ['64GB', '128GB', '256GB', '512GB', '1TB'];
const colors = ['Space Gray', 'Midnight', 'Starlight', 'Blue', 'Green', 'Black', 'White', 'Gold', 'Silver', 'Purple', 'Red', 'Pink'];
const conditions = ['Grade A', 'Grade B', 'Grade C', 'New', 'Excellent', 'Fair'];
const carriers = ['Unlocked', 'AT&T', 'Verizon', 'T-Mobile'];
const countries = ['USA', 'CANADA', 'CHINA'];
const simTypes = ['sim', 'esim'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomId() {
  return 'P' + Math.floor(10000 + Math.random() * 90000);
}

function generateProducts(count = 24) {
  const products = [];
  for (let i = 0; i < count; i++) {
    const manufacturer = 'Apple';
    const model = randomItem(models.filter(m => m.startsWith('iPhone') || m.startsWith('MacBook')));
    const capacity = randomItem(capacities);
    const color = randomItem(colors);
    const condition = randomItem(conditions);
    const carrier = randomItem(carriers);
    const basePrice = model.includes('Pro Max') ? 799 : model.includes('Pro') ? 649 : model.includes('MacBook') ? 899 : 499;
    const price = basePrice + Math.floor(Math.random() * 200) - 50;
    const country = randomItem(countries);
    const sim = randomItem(simTypes);
    const modelCode = 'GA' + String(10000 + i).padStart(5, '0') + '-US';
    products.push({
      id: `prod-${i + 1}`,
      name: `${manufacturer} ${model}`,
      manufacturer,
      model,
      modelCode,
      capacity,
      color,
      condition,
      carrier,
      country,
      sim,
      stock: Math.floor(Math.random() * 900) + 10,
      imei: 'Clean',
      esn: 'Clean',
      sku: 'SKU: ' + randomId(),
      price: (price < 400 ? 399 : price).toFixed(2),
      image: null,
      dateAdded: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return products.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
}

export const mockProducts = generateProducts(100);
export { manufacturers, models, capacities, colors, conditions, carriers, countries, simTypes };
