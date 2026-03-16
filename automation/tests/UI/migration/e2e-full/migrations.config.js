// E2E Migration Config — all 46 migrations
//
// Fields per entry:
//   id         — listing ID from the marketplace API (used for direct URL navigation)
//   card       — card title (for logging only)
//   type       — 'file' | 'api'
//   dataTypes  — entities to select in Step 1 (must match wizard button labels)
//   csvFiles   — { dataType: absolutePath } for file-based migrations
//   sourceType — how to connect source in Step 2 (API-based only)
//   targetType — how to connect destination: 'lsr' | 'shopify' | 'clover' | 'qbo' | 'xero' | 'hubspot' | 'salesforce' | 'chargebee' | 'cin7core'
//   phase      — 1 (ready) → 4 (needs new connection logic)
//   skip       — null to run, or string reason to skip entirely
//
// Phase guide:
//   1 — File Based → LSR target  (LSR OAuth already implemented)
//   2 — File Based → Shopify target
//   3 — File Based → other targets (Clover, QBO, Xero, HubSpot, Salesforce)
//   4 — API Based (needs source connection per sourceType)

const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../../../fixtures/data');

const csv = {
  customers: path.join(DATA_DIR, 'customers_export.csv'),
  products:  path.join(DATA_DIR, 'products_export.csv'),
  orders:    path.join(DATA_DIR, 'orders_export.csv'),
};

const migrations = [

  // ─────────────────────────────────────────────────────────────
  // PHASE 1 — File Based → LSR target (LSR OAuth already built)
  // ─────────────────────────────────────────────────────────────

  {
    id:         '69281ec53aa2ced755fdb995',
    card:       'GreenLine POS to Lightspeed Retail (X-Series)',
    type:       'file',
    dataTypes:  ['Customers', 'Products'],
    csvFiles:   { Customers: csv.customers, Products: csv.products },
    targetType: 'lsr',
    phase:      1,
    skip:       null,
  },

  {
    id:         '6964b8485d9af1fad3128159',
    card:       'QuickBooks POS to Lightspeed Retail (X-Series)',
    type:       'file',
    dataTypes:  ['Customers', 'Products'],
    csvFiles:   { Customers: csv.customers, Products: csv.products },
    targetType: 'lsr',
    phase:      1,
    skip:       null,
  },

  {
    id:          '6945216cabb2becbe3f3b884',
    card:        'Square to Lightspeed Retail (X-Series)',
    type:        'api',
    dataTypes:   ['Customers', 'Products', 'Sales'],
    sourceType:  'square',
    targetType:  'lsr',
    phase:       4,
    skip:        'Source credentials needed: square (SQUARE_USERNAME, SQUARE_PASSWORD)',
  },

  {
    id:         '6931a7e7f983945a2eb05ede',
    card:       'Shopify to Lightspeed Retail (X-Series)',
    type:       'file',
    dataTypes:  ['customer', 'Products'],
    csvFiles:   { customer: csv.customers, Products: csv.products },
    targetType: 'lsr',
    phase:      1,
    // Already covered by e2e_migration.spec.js — include here for unified runner
    skip:       null,
  },

  // ─────────────────────────────────────────────────────────────
  // PHASE 2 — File Based → Shopify target
  // ─────────────────────────────────────────────────────────────

  {
    id:         '69a04349106d2189c6b4b6ef',
    card:       'Adobe Commerce to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products', 'Orders'],
    csvFiles:   { Customers: csv.customers, Products: csv.products, Orders: csv.orders },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '69a04348106d2189c6b4b6ed',
    card:       'Amazon Seller Central to Shopify',
    type:       'file',
    dataTypes:  ['Products', 'Orders'],
    csvFiles:   { Products: csv.products, Orders: csv.orders },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '69a04348106d2189c6b4b6eb',
    card:       'Etsy to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products', 'Orders'],
    csvFiles:   { Customers: csv.customers, Products: csv.products, Orders: csv.orders },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '698442640a043c0556c350ee',
    card:       'Lightspeed Retail (X-Series) to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products'],
    csvFiles:   { Customers: csv.customers, Products: csv.products },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '69a04364106d2189c6b4b6f3',
    card:       'PrestaShop to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products', 'Orders'],
    csvFiles:   { Customers: csv.customers, Products: csv.products, Orders: csv.orders },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '698499480a043c0556c35de9',
    card:       'RainPOS to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products'],
    csvFiles:   { Customers: csv.customers, Products: csv.products },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '69aeac45c1c4da4c3de346eb',
    card:       'ShopKeep to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products', 'Orders'],
    csvFiles:   { Customers: csv.customers, Products: csv.products, Orders: csv.orders },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '69a04364106d2189c6b4b6f1',
    card:       'Wix eCommerce to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products', 'Orders'],
    csvFiles:   { Customers: csv.customers, Products: csv.products, Orders: csv.orders },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  {
    id:         '697b3d2d6919937d9db4d5ec',
    card:       'WooCommerce to Shopify',
    type:       'file',
    dataTypes:  ['Customers', 'Products'],
    csvFiles:   { Customers: csv.customers, Products: csv.products },
    targetType: 'shopify',
    phase:      2,
    skip:       process.env.SHOPIFY_SHOP ? null : 'Set SHOPIFY_SHOP env var to enable',
  },

  // ─────────────────────────────────────────────────────────────
  // PHASE 3 — File Based → other targets
  // ─────────────────────────────────────────────────────────────

  // → Clover
  {
    id:         '69a04552106d2189c6b4b74e',
    card:       'Lightspeed Retail (X-Series) to Clover',
    type:       'file',
    dataTypes:  ['Customers', 'Products'],
    csvFiles:   { Customers: csv.customers, Products: csv.products },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  {
    id:         '699eba55766a51a016ba61ea',
    card:       'Revel to Clover',
    type:       'file',
    dataTypes:  ['Customers', 'Products', 'Orders'],
    csvFiles:   { Customers: csv.customers, Products: csv.products, Orders: csv.orders },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  {
    // Use version 3 (4 entities) — v2 duplicate excluded below
    id:         '69a04551106d2189c6b4b748',
    card:       'Shopify to Clover',
    type:       'file',
    dataTypes:  ['Customers', 'Products', 'Orders'],
    csvFiles:   { Customers: csv.customers, Products: csv.products, Orders: csv.orders },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  {
    id:         '69980be288eba38d5b7f4118',
    card:       'Shopify to Clover (v2)',
    type:       'file',
    dataTypes:  ['Customer', 'Product'],
    csvFiles:   { Customer: csv.customers, Product: csv.products },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  {
    id:         '6971ee523f8c6265ae804306',
    card:       'Square to Clover',
    type:       'file',
    dataTypes:  ['Customer', 'Products', 'Order'],
    csvFiles:   { Customer: csv.customers, Products: csv.products, Order: csv.orders },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  {
    id:         '69a04551106d2189c6b4b74a',
    card:       'Toast to Clover',
    type:       'file',
    dataTypes:  ['Customers', 'Orders'],
    csvFiles:   { Customers: csv.customers, Orders: csv.orders },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  {
    id:         '69a04552106d2189c6b4b74c',
    card:       'TouchBistro to Clover',
    type:       'file',
    dataTypes:  ['Customers', 'Orders'],
    csvFiles:   { Customers: csv.customers, Orders: csv.orders },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  {
    id:         '693050abf983945a2eb0515f',
    card:       'Vend to Clover',
    type:       'file',
    dataTypes:  ['customer', 'product'],
    csvFiles:   { customer: csv.customers, product: csv.products },
    targetType: 'clover',
    phase:      3,
    skip:       process.env.CLOVER_EMAIL ? null : 'Set CLOVER_EMAIL + CLOVER_PASSWORD env vars to enable',
  },

  // → QuickBooks Online
  {
    id:         '69a041aa106d2189c6b4b58f',
    card:       'FreshBooks to QuickBooks Online',
    type:       'file',
    dataTypes:  ['Customers', 'Invoices'],
    csvFiles:   { Customers: csv.customers, Invoices: csv.orders },
    targetType: 'qbo',
    phase:      3,
    skip:       process.env.QBO_EMAIL ? null : 'Set QBO_EMAIL + QBO_PASSWORD env vars to enable',
  },

  {
    id:         '699a987988eba38d5b7f6a97',
    card:       'Sage Cloud to QuickBooks Online',
    type:       'file',
    dataTypes:  ['Customers', 'Invoices'],
    csvFiles:   { Customers: csv.customers, Invoices: csv.orders },
    targetType: 'qbo',
    phase:      3,
    skip:       process.env.QBO_EMAIL ? null : 'Set QBO_EMAIL + QBO_PASSWORD env vars to enable',
  },

  {
    id:         '69a041bf106d2189c6b4b591',
    card:       'Zoho Books to QuickBooks Online',
    type:       'file',
    dataTypes:  ['Customers', 'Invoices'],
    csvFiles:   { Customers: csv.customers, Invoices: csv.orders },
    targetType: 'qbo',
    phase:      3,
    skip:       process.env.QBO_EMAIL ? null : 'Set QBO_EMAIL + QBO_PASSWORD env vars to enable',
  },

  // → Xero
  {
    id:         '699eb48a766a51a016ba5f72',
    card:       'QuickBooks Desktop to Xero',
    type:       'file',
    dataTypes:  ['Customers', 'Invoices'],
    csvFiles:   { Customers: csv.customers, Invoices: csv.orders },
    targetType: 'xero',
    phase:      3,
    skip:       process.env.XERO_EMAIL ? null : 'Set XERO_EMAIL + XERO_PASSWORD env vars to enable',
  },

  // → HubSpot
  {
    id:         '698abc1fea890ce4c398584f',
    card:       'Zoho CRM to HubSpot',
    type:       'file',
    dataTypes:  ['Contacts', 'Companies', 'Deals'],
    csvFiles:   { Contacts: csv.customers, Companies: csv.customers, Deals: csv.orders },
    targetType: 'hubspot',
    phase:      3,
    skip:       process.env.HUBSPOT_EMAIL ? null : 'Set HUBSPOT_EMAIL + HUBSPOT_PASSWORD env vars to enable',
  },

  // → Salesforce
  {
    id:         '6999b32588eba38d5b7f69e5',
    card:       'Zoho CRM to Salesforce (File Import)',
    type:       'file',
    dataTypes:  ['Accounts', 'Contacts'],
    csvFiles:   { Accounts: csv.customers, Contacts: csv.customers },
    targetType: 'salesforce',
    phase:      3,
    skip:       process.env.SALESFORCE_EMAIL ? null : 'Set SALESFORCE_EMAIL + SALESFORCE_PASSWORD env vars to enable',
  },

  // ─────────────────────────────────────────────────────────────
  // PHASE 4 — API Based
  // ─────────────────────────────────────────────────────────────

  {
    id:          '697f60ea02ac581022ea527e',
    card:        'BigCommerce to Shopify',
    type:        'api',
    dataTypes:   ['Customers', 'Categories', 'Products', 'Orders'],
    sourceType:  'bigcommerce',
    targetType:  'shopify',
    phase:       4,
    skip:        (process.env.BIGCOMMERCE_STORE_HASH && process.env.SHOPIFY_SHOP) ? null
                   : 'Set BIGCOMMERCE_STORE_HASH + BIGCOMMERCE_ACCESS_TOKEN + SHOPIFY_SHOP to enable',
  },

  {
    id:          '698d83b23a196501b05645e7',
    card:        'Clover to Lightspeed Retail (X-Series)',
    type:        'api',
    dataTypes:   ['customer', 'item_group', 'product', 'sale'],
    sourceType:  'clover',
    targetType:  'lsr',
    phase:       4,
    skip:        process.env.CLOVER_MERCHANT_ID ? null
                   : 'Set CLOVER_MERCHANT_ID + CLOVER_ACCESS_TOKEN to enable',
  },

  {
    id:          '69a04364106d2189c6b4b6f5',
    card:        'Clover to Shopify',
    type:        'api',
    dataTypes:   ['Customer', 'Item Group', 'Product', 'Order'],
    sourceType:  'clover',
    targetType:  'shopify',
    phase:       4,
    skip:        (process.env.CLOVER_MERCHANT_ID && process.env.SHOPIFY_SHOP) ? null
                   : 'Set CLOVER_MERCHANT_ID + CLOVER_ACCESS_TOKEN + SHOPIFY_SHOP to enable',
  },

  {
    id:          '697c701c6919937d9db4edac',
    card:        'Cin7 Omni to Cin7 Core',
    type:        'api',
    dataTypes:   ['Customers', 'Products', 'Sales'],
    sourceType:  'cin7omni',
    targetType:  'cin7core',
    phase:       4,
    skip:        process.env.CIN7OMNI_USERNAME ? null
                   : 'Set CIN7OMNI_USERNAME + CIN7OMNI_PASSWORD + CIN7CORE_USERNAME + CIN7CORE_PASSWORD to enable',
  },

  {
    id:          '6931a872f983945a2eb05ef4',
    card:        'HubSpot Contacts Migration',
    type:        'api',
    dataTypes:   ['customer'],
    sourceType:  'hubspot',
    targetType:  'hubspot',
    phase:       4,
    skip:        process.env.HUBSPOT_EMAIL ? null
                   : 'Set HUBSPOT_EMAIL + HUBSPOT_PASSWORD to enable',
  },

  {
    id:          '69a03ca5106d2189c6b4b0d7',
    card:        'HubSpot to Salesforce',
    type:        'api',
    dataTypes:   ['Contacts', 'Companies', 'Deals'],
    sourceType:  'hubspot',
    targetType:  'salesforce',
    phase:       4,
    skip:        (process.env.HUBSPOT_EMAIL && process.env.SALESFORCE_EMAIL) ? null
                   : 'Set HUBSPOT_EMAIL + HUBSPOT_PASSWORD + SALESFORCE_EMAIL + SALESFORCE_PASSWORD to enable',
  },

  {
    id:          '69a03ef1106d2189c6b4b477',
    card:        'Microsoft Dynamics 365 to Salesforce',
    type:        'api',
    dataTypes:   ['Accounts', 'Contacts', 'Opportunities'],
    sourceType:  'dynamics',
    targetType:  'salesforce',
    phase:       4,
    skip:        (process.env.DYNAMICS_EMAIL && process.env.SALESFORCE_EMAIL) ? null
                   : 'Set DYNAMICS_EMAIL + DYNAMICS_PASSWORD + SALESFORCE_EMAIL + SALESFORCE_PASSWORD to enable',
  },

  {
    id:          '69a6c2128c78481c4c9b9a0a',
    card:        'QuickBooks Online to Xero',
    type:        'api',
    dataTypes:   ['customer', 'item', 'invoice'],
    sourceType:  'qbo',
    targetType:  'xero',
    phase:       4,
    skip:        (process.env.QBO_EMAIL && process.env.XERO_EMAIL) ? null
                   : 'Set QBO_EMAIL + QBO_PASSWORD + XERO_EMAIL + XERO_PASSWORD to enable',
  },

  {
    id:          '698acd73ea890ce4c39862c9',
    card:        'Salesforce to HubSpot',
    type:        'api',
    dataTypes:   ['Contacts', 'Companies', 'Deals'],
    sourceType:  'salesforce',
    targetType:  'hubspot',
    phase:       4,
    skip:        (process.env.SALESFORCE_EMAIL && process.env.HUBSPOT_EMAIL) ? null
                   : 'Set SALESFORCE_EMAIL + SALESFORCE_PASSWORD + HUBSPOT_EMAIL + HUBSPOT_PASSWORD to enable',
  },

  {
    id:          '6979f2256919937d9db4c416',
    card:        'Square to Shopify',
    type:        'api',
    dataTypes:   ['Customer', 'Product', 'Order'],
    sourceType:  'square',
    targetType:  'shopify',
    phase:       4,
    skip:        (process.env.SQUARE_EMAIL && process.env.SHOPIFY_SHOP) ? null
                   : 'Set SQUARE_EMAIL + SQUARE_PASSWORD + SHOPIFY_SHOP to enable',
  },

  {
    id:          '6984a5ba0a043c0556c35f3a',
    card:        'Stripe to Chargebee',
    type:        'api',
    dataTypes:   ['Customer', 'Item', 'Subscription'],
    sourceType:  'stripe',
    targetType:  'chargebee',
    phase:       4,
    skip:        (process.env.STRIPE_API_KEY && process.env.CHARGEBEE_SITE) ? null
                   : 'Set STRIPE_API_KEY + CHARGEBEE_SITE + CHARGEBEE_API_KEY to enable',
  },

  {
    id:          '69984f0d88eba38d5b7f544c',
    card:        'Xero to QuickBooks Online',
    type:        'api',
    dataTypes:   ['Customers', 'Products', 'Sales Invoices'],
    sourceType:  'xero',
    targetType:  'qbo',
    phase:       4,
    skip:        (process.env.XERO_EMAIL && process.env.QBO_EMAIL) ? null
                   : 'Set XERO_EMAIL + XERO_PASSWORD + QBO_EMAIL + QBO_PASSWORD to enable',
  },

  {
    id:          '69a03ee5106d2189c6b4b475',
    card:        'Zoho CRM to Salesforce',
    type:        'api',
    dataTypes:   ['Accounts', 'Contacts', 'Leads'],
    sourceType:  'zohocrm',
    targetType:  'salesforce',
    phase:       4,
    skip:        (process.env.ZOHOCRM_EMAIL && process.env.SALESFORCE_EMAIL) ? null
                   : 'Set ZOHOCRM_EMAIL + ZOHOCRM_PASSWORD + SALESFORCE_EMAIL + SALESFORCE_PASSWORD to enable',
  },

  // ─────────────────────────────────────────────────────────────
  // BLOCKED — R-Series source (Cloudflare verification issue)
  // ─────────────────────────────────────────────────────────────

  {
    id:          '6979e9d16919937d9db4c2eb',
    card:        'Lightspeed Retail (R-Series) to Clover',
    type:        'api',
    dataTypes:   ['customer', 'product', 'sale'],
    sourceType:  'lsr-series',
    targetType:  'clover',
    phase:       4,
    skip:        'BLOCKED — R-Series source fails Cloudflare verification',
  },

  {
    id:          '69318c7ef983945a2eb05ab7',
    card:        'Lightspeed Retail (R-Series) to Lightspeed Retail (X-Series)',
    type:        'api',
    dataTypes:   ['Customers', 'Products', 'Sales'],
    sourceType:  'lsr-series',
    targetType:  'lsr',
    phase:       4,
    skip:        'BLOCKED — R-Series source fails Cloudflare verification',
  },

  {
    id:          '698069d802ac581022ea5b15',
    card:        'Lightspeed Retail (R-Series) to Shopify',
    type:        'api',
    dataTypes:   ['Customer', 'Product', 'Inventory', 'Order'],
    sourceType:  'lsr-series',
    targetType:  'shopify',
    phase:       4,
    skip:        'BLOCKED — R-Series source fails Cloudflare verification',
  },

  // ─────────────────────────────────────────────────────────────
  // SKIP — Deprecated
  // ─────────────────────────────────────────────────────────────

  {
    id:          '69984ef288eba38d5b7f53d4',
    card:        'Xero to QuickBooks Online (Deprecated)',
    type:        'api',
    dataTypes:   ['Customers', 'Products', 'Sales Invoices'],
    sourceType:  'xero',
    targetType:  'qbo',
    phase:       4,
    skip:        'Deprecated — superseded by Xero to QuickBooks Online',
  },

];

module.exports = migrations;
