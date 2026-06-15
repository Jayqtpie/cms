import { defineConfig } from '@playwright/test';
import bcrypt from 'bcryptjs';
import path from 'node:path';

const PORT = 4099;
process.env.CMS_PASSWORD = bcrypt.hashSync('letmein', 10);

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: 'node dist/server/index.js',
    port: PORT,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      JWT_SECRET: 'e2e-secret',
      CMS_PASSWORD: bcrypt.hashSync('letmein', 10),
      CMS_SITE_CONFIG: path.resolve(process.cwd(), 'cms.site.e2e.json'),
      CMS_DATA_DIR: path.resolve(process.cwd(), '.e2e-data'),
    },
  },
});
