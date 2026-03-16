// Migration config table — one entry per migration we can E2E test.
//
// Fields:
//   cardTitle       — exact text on the marketplace card
//   type            — 'file' | 'api'
//   dataTypes       — data type buttons to select on Step 1
//   csvFiles        — { DataType: absolutePath } for file-based (null for api)
//   sourceCredentials — { storeHash, accessToken } for API-based source connect (null for file)
//   destinationDomain — domain prefix for OAuth connect step (null if not needed)
//   skip            — true to exclude from runner (e.g. needs real account)
//   notes           — freeform notes

const path = require('path');
const DATA = path.resolve(__dirname, '../../../../fixtures/data');

const configs = [
  // ─── FILE-BASED ────────────────────────────────────────────────────────────
  // Step 3 for all file-based migrations: "Connect destination"
  //   input placeholder = "Enter shop" → Shopify store domain (e.g. my-store.myshopify.com)
  //   Set SHOPIFY_SHOP env var to enable these configs.
  {
    cardTitle:            'Adobe Commerce to Shopify',
    type:                 'file',
    dataTypes:            ['Customers', 'Products'],
    csvFiles: {
      Customers: path.join(DATA, 'customers_export.csv'),
      Products:  path.join(DATA, 'products_export.csv'),
    },
    sourceCredentials:    null,
    destinationDomain:    process.env.SHOPIFY_SHOP || null,
    skip:                 !process.env.SHOPIFY_SHOP,
    notes:                'File-based 4-step: Select→Upload→Connect(shop OAuth)→Review',
  },
  // NOTE: BigCommerce to Shopify is API-based only (no file upload step).
  // Step structure: Select → Connect (storeHash+accessToken+shop) → Validate → Review
  // Config is in the API section below.
  {
    cardTitle:            'Shopify to Lightspeed Retail (X-Series)',
    type:                 'file',
    dataTypes:            ['Customers'],
    csvFiles: {
      Customers: path.join(DATA, 'customers_export.csv'),
    },
    sourceCredentials:    null,
    destinationDomain:    process.env.LSR_DOMAIN || null,   // e.g. 'linkprod01'
    skip:                 !process.env.LSR_DOMAIN,
    notes:                '5-step wizard: Select→Upload→Connect→Settings→Review',
  },

  // ─── API-BASED ─────────────────────────────────────────────────────────────
  // Step 2 for API migrations has 3 inputs on the SAME screen:
  //   storeHash + accessToken  → source system credentials
  //   shop                     → destination Shopify store domain
  // Two Connect Account buttons — first = source, second = destination.
  {
    cardTitle:            'BigCommerce to Shopify',
    type:                 'api',
    dataTypes:            ['Customers', 'Products'],
    csvFiles:             null,
    sourceCredentials: {
      storeHash:    process.env.BC_STORE_HASH    || null,
      accessToken:  process.env.BC_ACCESS_TOKEN  || null,
      shop:         process.env.SHOPIFY_SHOP     || null,  // destination Shopify domain
    },
    destinationDomain:    null,   // handled inline on Step 2 via shop input
    skip:                 !process.env.BC_STORE_HASH,
    notes:                'API-based — source = BigCommerce, destination = Shopify (inline on Step 2)',
  },
  {
    cardTitle:            'Square to Shopify',
    type:                 'api',
    dataTypes:            ['Customers', 'Products'],
    csvFiles:             null,
    sourceCredentials: {
      storeHash:    process.env.SQUARE_STORE_HASH    || null,
      accessToken:  process.env.SQUARE_ACCESS_TOKEN  || null,
      shop:         process.env.SHOPIFY_SHOP         || null,
    },
    destinationDomain:    null,
    skip:                 !process.env.SQUARE_STORE_HASH,
    notes:                'API-based — source = Square credentials',
  },
];

module.exports = configs;
