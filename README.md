# ATV Operational Dashboard

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in SQL migrations only. `pnpm db:push`: generate and apply schema changes for development.
- Before deploying a release that adds a migration, back up the target database and apply the reviewed migration with `DATABASE_URL=<target> pnpm db:migrate`; migrations are intentionally not run automatically at application startup.
- `pnpm check` / `pnpm test`: types and application tests.

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

รายละเอียดประเภทเซิร์ฟเวอร์ API, backend services, ฐานข้อมูล, authorization และ data flow ดูที่ [`SERVER_ARCHITECTURE.md`](./SERVER_ARCHITECTURE.md)

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.
