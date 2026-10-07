# Going live checklist

Set these as environment variables on your host (never commit them):

| Variable | Value |
|---|---|
| ANTHROPIC_API_KEY | your key (use a NEW key, not the one from your dev .env) |
| SECRET_KEY | long random text, e.g. 40+ random characters |
| ADMIN_EMAIL | your admin login email |
| ADMIN_PASSWORD | a strong password (only used to create the account on first start) |
| DATABASE_URL | Postgres URL from your host (leave unset to use a local SQLite file) |
| ENV / DEBUG | production / false |

Then sign in at /login with ADMIN_EMAIL, open **Manage store** and add your products.
