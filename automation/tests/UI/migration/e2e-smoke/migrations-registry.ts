// Migration Registry — single source of truth for all 44 marketplace migrations.
// Auto-generated via probe.spec.js (fromImportV2 field from API).
//
// type: 'file' → Step 2 = Upload CSV files
// type: 'api'  → Step 2 = Connect source/target accounts via API credentials
//
// dataTypes: entity names as shown in the wizard Step 1 UI (may vary slightly from API names)

const MIGRATIONS = [
  { card: 'Adobe Commerce to Shopify',                            type: 'file', id: '69a04349106d2189c6b4b6ef', dataTypes: ['Customers', 'Products', 'Orders'] },
  { card: 'Amazon Seller Central to Shopify',                     type: 'file', id: '69a04348106d2189c6b4b6ed', dataTypes: ['Products', 'Orders'] },
  { card: 'BigCommerce to Shopify',                               type: 'api',  id: '697f60ea02ac581022ea527e', dataTypes: ['Customers', 'Categories', 'Products', 'Orders'] },
  { card: 'Cin7 Omni to Cin7 Core',                               type: 'api',  id: '697c701c6919937d9db4edac', dataTypes: ['Customers', 'Suppliers', 'Products', 'Sales', 'Payments'] },
  { card: 'Clover to Lightspeed Retail (X-Series)',               type: 'api',  id: '698d83b23a196501b05645e7', dataTypes: ['customer', 'item_group', 'product', 'sale'] },
  { card: 'Clover to Shopify',                                    type: 'api',  id: '69a04364106d2189c6b4b6f5', dataTypes: ['Customer', 'Item Group', 'Product', 'Order'] },
  { card: 'Etsy to Shopify',                                      type: 'file', id: '69a04348106d2189c6b4b6eb', dataTypes: ['Customers', 'Products', 'Orders'] },
  { card: 'FreshBooks to QuickBooks Online',                      type: 'file', id: '69a041aa106d2189c6b4b58f', dataTypes: ['Items & Services', 'Invoices', 'Payments'] },
  { card: 'GreenLine POS to Lightspeed Retail (X-Series)',        type: 'file', id: '69281ec53aa2ced755fdb995', dataTypes: ['Customers', 'Products'] },
  { card: 'HubSpot Contacts Migration',                           type: 'api',  id: '6931a872f983945a2eb05ef4', dataTypes: ['customer'] },
  { card: 'HubSpot to Salesforce',                                type: 'api',  id: '69a03bfe106d2189c6b4af3c', dataTypes: ['Contacts', 'Leads'] },
  { card: 'Lightspeed Retail (R-Series) to Clover',               type: 'api',  id: '6979e9d16919937d9db4c2eb', dataTypes: ['customer', 'product', 'sale'] },
  { card: 'Lightspeed Retail (R-Series) to Lightspeed Retail (X-Series)', type: 'api', id: '69318c7ef983945a2eb05ab7', dataTypes: ['Customers', 'Products', 'Sales'] },
  { card: 'Lightspeed Retail (R-Series) to Shopify',              type: 'api',  id: '698069d802ac581022ea5b15', dataTypes: ['Customer', 'Product', 'Order'] },
  { card: 'Lightspeed Retail (X-Series) to Clover',               type: 'file', id: '69a04552106d2189c6b4b74e', dataTypes: ['Customers', 'Products', 'Sales'] },
  { card: 'Lightspeed Retail (X-Series) to Shopify',              type: 'file', id: '698442640a043c0556c350ee', dataTypes: ['Customers', 'Products', 'Sales'] },
  { card: 'Microsoft Dynamics 365 to Salesforce',                 type: 'api',  id: '69a03ef1106d2189c6b4b477', dataTypes: ['Accounts', 'Contacts', 'Opportunities', 'Leads'] },
  { card: 'PrestaShop to Shopify',                                type: 'file', id: '69a04364106d2189c6b4b6f3', dataTypes: ['Customers', 'Products', 'Orders'] },
  { card: 'QuickBooks Desktop to Xero',                           type: 'file', id: '699eb48a766a51a016ba5f72', dataTypes: ['Customers', 'Products & Services', 'Invoices'] },
  { card: 'QuickBooks Online to Xero',                            type: 'api',  id: '69a6c2128c78481c4c9b9a0a', dataTypes: ['customer', 'item', 'invoice'] },
  { card: 'QuickBooks POS to Lightspeed Retail (X-Series)',       type: 'file', id: '6964b8485d9af1fad3128159', dataTypes: ['Customers', 'Products', 'Sales'] },
  { card: 'RainPOS to Shopify',                                   type: 'file', id: '698499480a043c0556c35de9', dataTypes: ['Customers', 'Products'] },
  { card: 'Revel to Clover',                                      type: 'file', id: '699eba55766a51a016ba61ea', dataTypes: ['Customers', 'Products', 'Orders'] },
  { card: 'Sage Cloud to QuickBooks Online',                      type: 'file', id: '699a987988eba38d5b7f6a97', dataTypes: ['Customers', 'Products & Services', 'Invoices'] },
  { card: 'Salesforce to HubSpot',                                type: 'api',  id: '698acd73ea890ce4c39862c9', dataTypes: ['Contacts', 'Companies', 'Deals'] },
  { card: 'ShopKeep to Shopify',                                   type: 'file', id: '69aeac45c1c4da4c3de346eb', dataTypes: ['Customers', 'Products', 'Orders'] },
  { card: 'Shopify to Clover',                                    type: 'file', id: '697b48f86919937d9db4dad6', dataTypes: ['Customers', 'Products', 'Orders'] },
  { card: 'Shopify to Clover (v2)',                               type: 'file', id: '69980be288eba38d5b7f4118', dataTypes: ['Customer', 'Product'] },
  { card: 'Shopify to Lightspeed Retail (X-Series)',              type: 'file', id: '6931a7e7f983945a2eb05ede', dataTypes: ['customer', 'Products', 'sales'] },
  { card: 'Square to Clover',                                     type: 'file', id: '6971ee523f8c6265ae804306', dataTypes: ['Customer', 'Products', 'Order'] },
  { card: 'Square to Lightspeed Retail (X-Series)',               type: 'file', id: '6945216cabb2becbe3f3b884', dataTypes: ['Customers', 'Products', 'Sales'] },
  { card: 'Square to Shopify',                                    type: 'file', id: '6979f2256919937d9db4c416', dataTypes: ['Customer', 'Product', 'Order'] },
  { card: 'Stripe to Chargebee',                                  type: 'api',  id: '6984a5ba0a043c0556c35f3a', dataTypes: ['Customer', 'Item', 'Subscription', 'Invoice'] },
  { card: 'Toast to Clover',                                      type: 'file', id: '69a04551106d2189c6b4b74a', dataTypes: ['Customers', 'Menu Items', 'Orders'] },
  { card: 'TouchBistro to Clover',                                type: 'file', id: '69a04552106d2189c6b4b74c', dataTypes: ['Customers', 'Menu Items', 'Orders'] },
  { card: 'Vend to Clover',                                       type: 'file', id: '693050abf983945a2eb0515f', dataTypes: ['customer', 'product'] },
  { card: 'Wix eCommerce to Shopify',                             type: 'file', id: '69a04364106d2189c6b4b6f1', dataTypes: ['Customers', 'Products', 'Orders'] },
  { card: 'WooCommerce to Shopify',                               type: 'file', id: '697b3d2d6919937d9db4d5ec', dataTypes: ['Customers', 'Products'] },
  { card: 'Xero to QuickBooks Online',                            type: 'api',  id: '69984f0d88eba38d5b7f544c', dataTypes: ['Customers', 'Products', 'Sales Invoices'] },
  { card: 'Xero to QuickBooks Online (Deprecated)',               type: 'api',  id: '69984ef288eba38d5b7f53d4', dataTypes: ['Customers', 'Products', 'Sales Invoices'] },
  { card: 'Zoho Books to QuickBooks Online',                      type: 'file', id: '69a041bf106d2189c6b4b591', dataTypes: ['Customers', 'Items & Services', 'Invoices'] },
  { card: 'Zoho CRM to HubSpot',                                  type: 'file', id: '698abc1fea890ce4c398584f', dataTypes: ['Contacts', 'Companies', 'Deals'] },
  { card: 'Zoho CRM to Salesforce',                               type: 'api',  id: '69a03ee5106d2189c6b4b475', dataTypes: ['Accounts', 'Contacts', 'Leads'] },
  { card: 'Zoho CRM to Salesforce (File Import)',                 type: 'file', id: '6999b32588eba38d5b7f69e5', dataTypes: ['Accounts', 'Contacts', 'Opportunities'] },
];

// Convenience subsets
const FILE_MIGRATIONS = MIGRATIONS.filter(m => m.type === 'file');
const API_MIGRATIONS  = MIGRATIONS.filter(m => m.type === 'api');

// Direct URL for a migration (skips marketplace navigation)
const BASE_URL = process.env.BASE_URL || 'https://marketplace.flow.staging.linktoany.com';
function detailUrl(m: { id: string }) { return `${BASE_URL}/listing/${m.id}`; }

export { MIGRATIONS, FILE_MIGRATIONS, API_MIGRATIONS, detailUrl };
