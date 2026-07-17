Adding keys is easy

For example:

```
node add-key.mjs standard 500 name
node add-key.mjs partner 1000 name
node add-key.mjs public 10 name
```

It generates a random 32-char hex key, prefixes it based on type (pk_ partner, pub_ public, sk_ everything else — matching your existing naming pattern), inserts it as active, and prints the key once so you can copy it. Run it directly on the VPS (or locally against a copy of the DB, then push).