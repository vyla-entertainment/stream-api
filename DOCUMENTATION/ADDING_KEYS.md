Adding keys is easy.

For example:

```bash
node add-key.mjs standard 500 name
node add-key.mjs partner 1000 name
node add-key.mjs public 10 name
````

It generates a random 32-character hex key, prefixes it based on the type (`pk_` for partner, `pub_` for public, `sk_` for everything else to match the existing naming pattern), inserts it as an active key, and prints the generated key once so you can copy it.

You can also manage keys through `db.json`:

```bash
node export-db.mjs
```

Export the current SQLite database into `db.json`, edit the file manually, then apply changes with:

```bash
node update-db.mjs
```

Run the scripts directly on the VPS, or work locally with a copy of the database and sync the changes afterward.