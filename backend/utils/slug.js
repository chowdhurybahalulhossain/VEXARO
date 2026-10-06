// "Slim Fit Jeans!" -> "slim-fit-jeans"
function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const FALLBACKS = { products: 'product', categories: 'category', brands: 'brand' };

// Returns a slug not used yet in `table`: slim-fit-jeans, slim-fit-jeans-2, ...
// `db` can be the pool or a client inside a transaction.
async function uniqueSlug(db, table, text) {
  if (!FALLBACKS[table]) {
    throw new Error('uniqueSlug: unsupported table');
  }

  const base = slugify(text) || FALLBACKS[table];
  let slug = base;
  let counter = 2;

  for (;;) {
    const result = await db.query(`SELECT 1 FROM ${table} WHERE slug = $1`, [slug]);
    if (result.rows.length === 0) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

module.exports = { slugify, uniqueSlug };
