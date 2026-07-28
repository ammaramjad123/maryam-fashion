import mongoose from 'mongoose';
import Party from '../src/models/Party.js';
import Product from '../src/models/Product.js';
import ExpenseHead from '../src/models/ExpenseHead.js';
import { CODE_NUMBERS, PRODUCT_OPENINGS } from '../src/data/productOpenings.js';

// The verified 24/07/2025 masters. Seeds all 41 real codes with their real
// opening stocks (sum 2,804) so the stock report reproduces the paper totals;
// cost is derived from the code (docs/07 R6), never stored.
export async function seedMasters() {
  const products = {};
  for (const n of CODE_NUMBERS) {
    const code = `K${n}`;
    products[code] = await Product.create({
      code,
      name: `Cloth ${code}`,
      openingStock: PRODUCT_OPENINGS[n] ?? 0,
    });
  }

  const parties = {
    slmnAzam: await Party.create({
      accountCode: '1101001',
      name: 'Slmn azam',
      type: 'CUSTOMER',
      openingBalance: 0,
      openingType: 'DR',
    }),
    farhan: await Party.create({
      accountCode: '2201001',
      name: 'farhan malik account',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
    }),
    salman: await Party.create({
      accountCode: '2201002',
      name: 'salman malik',
      type: 'EMPLOYEE',
      openingBalance: 0,
      openingType: 'CR',
    }),
  };

  const heads = {};
  for (const name of [
    'masjid',
    'gaurd',
    'safai',
    'boys exp',
    'hall rent',
    'tea',
    'stall khana',
    'water',
    'computer rprng',
    'slmn mill kraya',
  ]) {
    heads[name] = await ExpenseHead.create({ name });
  }

  return { products, parties, heads };
}

export async function seedSetting(openingCash = 260297) {
  await mongoose.connection.collection('settings').insertOne({
    openingCash,
    shopName: 'Test Shop',
    currency: 'PKR',
    purchaseProfitFormula: 'ZERO',
    discountAppliesTo: 'CASH',
    allowNegativeStock: true,
  });
}

// The 24/07 sheet as a PUT payload (operator-entered fields only).
export function build0724Sections({ products, parties, heads }) {
  const sale = (code, partyKey, qty, rate) => ({
    productId: products[code]._id,
    partyId: partyKey ? parties[partyKey]._id : null,
    qty,
    rate,
  });

  return {
    discountOnSale: 0,
    sales: [
      sale('K44', null, 1, 2200), // cash
      sale('K30', null, 3, 1500), // cash
      sale('K44', 'slmnAzam', 50, 2000),
      sale('K64', 'slmnAzam', 6, 2700),
      sale('K40', 'slmnAzam', 15, 1800),
      sale('K30', 'slmnAzam', -77, 1400),
      sale('K32', 'slmnAzam', -6, 1450),
      sale('K40', 'slmnAzam', -3, 1800),
      sale('K30', 'slmnAzam', -3, 1400),
      sale('K50', 'slmnAzam', -2, 2300),
    ],
    purchases: [],
    receipts: [],
    payments: [
      { partyId: parties.farhan._id, narration: 'salary', amount: 45000 },
      { partyId: parties.salman._id, narration: 'salary', amount: 45000 },
    ],
    expenses: [
      { expenseHeadId: heads['masjid']._id, narration: 'masjid', amount: 5000 },
      { expenseHeadId: heads['gaurd']._id, narration: 'gaurd', amount: 1000 },
      { expenseHeadId: heads['safai']._id, narration: 'safai', amount: 1000 },
      { expenseHeadId: heads['boys exp']._id, narration: 'boys exp', amount: 7140 },
      { expenseHeadId: heads['hall rent']._id, narration: 'hall rent', amount: 73000 },
      { expenseHeadId: heads['tea']._id, narration: 'tea', amount: 1250 },
      { expenseHeadId: heads['stall khana']._id, narration: 'stall khana', amount: 500 },
      { expenseHeadId: heads['water']._id, narration: 'water', amount: 1050 },
      { expenseHeadId: heads['computer rprng']._id, narration: 'computer rprng', amount: 2500 },
      { expenseHeadId: heads['slmn mill kraya']._id, narration: 'slmn mill kraya', amount: 400 },
    ],
  };
}
