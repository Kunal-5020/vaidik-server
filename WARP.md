# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Runtime, tooling, and setup

- Node.js: this project targets Node `22.x` (see `package.json` `engines`).
- Package manager: `pnpm` (see `README.md`).
- Core stack: NestJS 11, MongoDB (via `@nestjs/mongoose`), Redis (via `@nestjs/cache-manager` + `cache-manager-redis-store`), WebSockets (Socket.IO-based gateways), and Jest for testing.
- Configuration is centralized through `@nestjs/config` and loaded from `.env` using the configs in `src/config/*.config.ts`.

Project setup:
- Install dependencies: `pnpm install`

## Common commands

All commands are run from the repository root.

### Build, run, and lint

- Build the project (TypeScript → `dist/` using Nest CLI):
  - `pnpm run build`
- Start in development (Nest in watch mode):
  - `pnpm run dev`
- Start in production (after `pnpm run build`):
  - `pnpm run start:prod`
- Directly run the compiled server (assumes `dist/main.js` exists):
  - `pnpm run start`
- Lint TypeScript sources with ESLint (auto-fix enabled for many rules):
  - `pnpm run lint`
- Format source and test files with Prettier:
  - `pnpm run format`

### Testing

Jest is configured in `package.json` with `rootDir: "src"` and `*.spec.ts` as the default test pattern.

- Run all unit tests:
  - `pnpm test`
- Watch tests while developing:
  - `pnpm run test:watch`
- Coverage report:
  - `pnpm run test:cov`
- E2E tests (uses `test/jest-e2e.json` if present):
  - `pnpm run test:e2e`

Running a subset of tests with Jest:
- Single test file:
  - `pnpm test -- src/auth/auth.service.spec.ts`
- Tests matching a name pattern (Jest `-t`/`--testNamePattern`):
  - `pnpm test -- -t "verifyOtp"`

### Deployment-related

- `pnpm run vercel-build` is a convenience alias that runs `npm run build` and is intended for hosted build environments.

## High-level architecture

This repository is a modular NestJS monolith structured around domain modules. Each module typically follows the same pattern:
- `controllers/` expose HTTP (REST) or WebSocket endpoints.
- `services/` encapsulate domain logic and cross-module orchestration.
- `schemas/` define Mongoose models for MongoDB persistence.
- `dto/` contains request/response DTOs and validation rules.

### Application bootstrap and configuration

- Entry point: `src/main.ts`
  - Creates a `NestExpressApplication` from `AppModule`.
  - Enables CORS for the Netlify admin frontend and local development origins.
  - Applies `helmet` with relaxed CSP/CORP settings to work with the current frontend.
  - Sets a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and transformation.
  - Sets the global prefix to `api/v1`.
  - Listens on `process.env.PORT || 3001` on `0.0.0.0`.

- Root module: `src/app.module.ts`
  - Uses `ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig, redisConfig, jwtConfig] })` to load:
    - `database` config from `src/config/database.config.ts` (Mongo URI + connection options).
    - `redis` config from `src/config/redis.config.ts`.
    - `jwt` config from `src/config/jwt.config.ts`.
  - Configures MongoDB via `MongooseModule.forRootAsync`, reading `database.uri` and `database.options` from config.
  - Configures a global `CacheModule` that:
    - Prefers `REDIS_URL` (e.g. Upstash/hosted Redis, including `rediss://` TLS handling).
    - Falls back to `REDIS_HOST` / `REDIS_PORT` or in-memory cache with a TTL if Redis is unavailable.
  - Registers the top-level feature modules: `AuthModule`, `UsersModule`, `AstrologersModule`, `ChatModule`, `CallsModule`, `StreamingModule`, `AdminModule`, `PaymentsModule`, `OrdersModule`, `RemediesModule`, `ReportsModule`, `NotificationsModule`, `RegistrationModule`, `UploadModule`, and `ShopifyModule`.
  - Enables `ScheduleModule.forRoot()` for cron/scheduled tasks (used in admin/notifications flows).

### Core domain modules

#### Authentication and identity (`src/auth`, `src/users`, `src/astrologers`)

- `AuthModule` wires up:
  - JWT authentication (`JwtModule.registerAsync` using `JWT_SECRET` / `JWT_EXPIRES_IN`).
  - Passport JWT strategy (`JwtStrategy`) and guard (`JwtAuthGuard`).
  - OTP services (`OtpService`, `OtpStorageService`) and a simple cache layer (`SimpleCacheService`) backed by the global cache.
  - Truecaller integration (`TruecallerService`, `auth.service.verifyTruecaller`).
  - Both user and astrologer authentication via dedicated controllers.
- `AuthService`:
  - Handles phone-based OTP login/registration and Truecaller-based login.
  - Generates a JWT access/refresh token pair via `JwtAuthService` and persists refresh tokens in the cache with a 7-day TTL.
  - Maintains per-user device metadata (FCM tokens, device IDs) and trims to the 5 most recent devices.
  - Uses `VEPAAR_API_KEY` (via `ConfigService`) to determine whether OTP-based auth is enabled.
- `UsersModule` and `AstrologersModule`:
  - Define the core `User` and `Astrologer` schemas and services.
  - Their schemas are imported into many other modules (orders, payments, notifications, admin, streaming) to provide a shared model for all user/astrologer-related operations.

#### Real-time interactions (`src/chat`, `src/calls`, `src/streaming`)

These three modules form the live interaction layer for the platform.

- `ChatModule`:
  - Mongoose models: `ChatSession`, `ChatMessage`, and `Order`.
  - HTTP controller for chat-related REST endpoints.
  - `ChatGateway` is a WebSocket gateway handling chat events (initiate chat, send/edit/react/reply, mark read, end chat) using DTOs in `chat/dto`.
  - Services coordinate chat messages, sessions, and billing hooks with `OrdersModule`, `PaymentsModule`, `AstrologersModule`, and `NotificationsModule`.

- `CallsModule`:
  - Mongoose model: `CallSession`.
  - `CallController` for REST control-plane actions and `CallGateway` for WebSocket-based signaling.
  - Services encapsulate calling concerns:
    - `AgoraService` for voice/video SDK token handling.
    - `CallSessionService` for lifecycle and persistence.
    - `CallRecordingService` and `CallBillingService` for recordings and per-minute billing.
  - Depends on `OrdersModule`, `PaymentsModule`, `AstrologersModule`, `NotificationsModule`, and `ChatModule` to keep call sessions, orders, wallet balances, and notifications in sync.

- `StreamingModule`:
  - Controllers for different actors: `StreamController` (general), `AstrologerStreamController`, and `AdminStreamController`.
  - `StreamGateway` for WebSocket events during live streams (join/leave, gifts, call requests, etc.).
  - Services for Agora-based streaming, analytics, recording, and stream session management.
  - Mongoose models: `StreamSession`, `StreamViewer`, `CallTransaction`, plus shared `Admin`, `Astrologer`, and `User` schemas imported from their modules.
  - Uses `JwtModule` and `PassportModule` internally to secure streaming-related endpoints and sockets.

#### Commerce and wallets (`src/payments`, `src/orders`)

- `PaymentsModule`:
  - Handles wallet transactions, payouts, and payment gateway integration (Razorpay).
  - Mongoose models: `WalletTransaction`, `PayoutRequest`.
  - Controllers:
    - `WalletController` for user wallet top-ups, balance queries, and transaction history.
    - `AstrologerPayoutController` for astrologer payout requests and status.
    - `PaymentWebhookController` for handling gateway webhooks.
  - Services:
    - `WalletService` maintains on-platform balances and transaction history.
    - `PayoutService` orchestrates payouts to astrologers.
    - `RazorpayService` integrates with Razorpay using credentials from configuration.

- `OrdersModule`:
  - Mongoose model: `Order` (plus `WalletTransaction` and `User` schemas for richer order views and wallet integration).
  - `OrdersController` exposes endpoints for session orders (create, extend, refund requests, ratings, etc.).
  - `OrdersService` owns order lifecycle logic.
  - `OrderPaymentService` coordinates with `PaymentsModule` to perform charges/refunds.
  - Imports `UsersModule`, `AstrologersModule`, and `NotificationsModule` to tie orders into user/astrologer identity and notification delivery.

#### Notifications and admin (`src/notifications`, `src/admin`)

- `NotificationsModule`:
  - Uses JWT (`JwtModule`) and `ConfigModule` to authenticate and configure notification channels.
  - Mongoose models: `Notification`, `ScheduledNotification`, plus `User` and `Astrologer` schemas.
  - `NotificationController` exposes REST endpoints for registering devices, marking notifications read, and listing notifications.
  - Services:
    - `NotificationService` encapsulates creation and querying of notifications.
    - `FcmService` integrates with Firebase Cloud Messaging for push notifications.
    - `NotificationDeliveryService` orchestrates sending via FCM and WebSockets.
  - `MobileNotificationGateway` is a WebSocket gateway for real-time mobile notifications.
  - Uses `forwardRef`/`require` to integrate with `AdminModule` while avoiding circular import issues.

- `AdminModule`:
  - Provides the admin back-office API and WebSocket interfaces.
  - Mongoose models: `Admin`, `AdminRole`, `AdminActivityLog`, and imported domain models such as `User`, `Astrologer`, `Order`, `WalletTransaction`, `PayoutRequest`, `Registration`, `ShopifyOrderEntity`, and `Remedy`.
  - Controllers cover authentication, user/astrologer management, orders/payments, analytics, notifications, registrations, activities, and remedies.
  - Services encapsulate each of these domains plus:
    - `AdminActivityLogService` for logging admin actions.
    - `NotificationSchedulerService` for scheduled/broadcast notifications.
    - `AdminMonitoringService` for admin-facing monitoring and health views.
  - `AdminNotificationGateway` is a WebSocket gateway to push events (e.g., alerts, background job status) to admin clients.
  - Uses `JwtModule` configured from `JWT_SECRET`/`JWT_EXPIRES_IN` and re-exports several providers (including `AdminAuthGuard` and `AdminNotificationGateway`) for use in other modules.

#### Content and domain features (`src/remedies`, `src/reports`, `src/registration`, `src/shopify`)

- `RemediesModule`:
  - Handles remedies suggested by astrologers and assigned to users.
  - Includes REST controllers for managing remedies and their statuses, plus schemas/services to persist and query remedies.
- `ReportsModule`:
  - Manages user/astrologer reports (e.g., post-session reports) with appropriate DTOs, schemas, and services.
- `RegistrationModule`:
  - Handles pre-onboarding flows such as initial registration, OTP verification, and guards for partially-registered entities.
  - `Registration` data is consumed by `AdminModule` for review/approval and analytics.
- `ShopifyModule`:
  - Integrates with Shopify via services and schemas, exposing controllers for syncing orders and searching products.
  - Provides a clear boundary for all Shopify-specific concerns (API interfaces, config, and persistence).

#### File uploads and static content (`src/upload`, `src/common`)

- `UploadModule`:
  - `UploadController` exposes endpoints for uploading images, videos, and audio.
  - `UploadService` wraps AWS S3 via `@aws-sdk/client-s3` and `@aws-sdk/lib-storage`:
    - Requires `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` in the environment (throws on misconfiguration).
    - Uses `FILE_UPLOAD_CONFIG` (from `upload/constants/file-types.constants.ts`) to determine folder layout per file type.
    - Switches between simple `PutObject` and multipart uploads based on file size, and constructs public S3 URLs.
    - Exposes helpers for deleting by full URL or key and for type-specific uploads (`uploadImage`, `uploadVideo`, `uploadAudio`).
- `src/common`:
  - `static-files.config.ts` centralizes static file serving options.
  - `utils/ip-extractor.util.ts` contains helpers to normalize/extract client IPs from proxied requests.

#### One-off scripts (`src/scripts`)

- `migrate-fcm-to-devices.ts` is a standalone Node script (using `dotenv` + raw Mongoose) to migrate legacy `fcmToken` fields on users/astrologers into a structured `devices` array.
  - It reads `MONGODB_URI` from the environment and operates directly on the database, then exits the process.
  - This script is independent of Nest and does not go through `AppModule`.

## Working effectively in this codebase with Warp

- When adding a new feature, follow the existing module patterns:
  - Create a new Nest module under `src/<feature>/` with `controllers/`, `services/`, `dto/`, and `schemas/` subdirectories when appropriate.
  - Register any new Mongoose schemas both in the feature module and, if the data is used in admin/analytics flows, also in `AdminModule` (and/or `NotificationsModule`) as those modules aggregate cross-domain data.
- For cross-module interactions:
  - Prefer injecting services from other modules rather than re-implementing logic (for example, reuse `OrdersService`, `WalletService`, `NotificationService` instead of duplicating order/payment/notification logic).
  - Use `forwardRef` as already done between `AdminModule` and `NotificationsModule` if you introduce new circular dependencies.
- For real-time flows:
  - Keep the separation between REST controllers (setup/config) and WebSocket gateways (live events) as seen in `chat`, `calls`, `streaming`, and `notifications`.
  - Ensure that any new gateway uses DTOs for payload validation, and that the corresponding services persist to MongoDB via the appropriate schemas.
