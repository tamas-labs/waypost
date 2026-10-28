import { defineConfig } from 'drizzle-kit';

// Generates the SQL migrations of the local database into src/db/migrations (npm run db:generate).
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
