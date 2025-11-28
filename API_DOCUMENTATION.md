# Vaidik Server API Reference

Comprehensive reference for the Vaidik Talk NestJS backend (`src/`). All HTTP routes are served under the global prefix `https://<host>/api/v1` as configured in `src/main.ts`. This document highlights available endpoints, required guards, input DTOs, response semantics, and integration touchpoints.

---

## 1. Platform Overview

- **Tech stack:** NestJS + Express, MongoDB (via Mongoose), Redis cache, Socket.io gateways, Razorpay, Shopify, Zoho Desk, FCM.
- **Global middleware:** CORS for admin and local frontends, `helmet`, JSON body parsing with a raw-body handler for Shopify webhooks, global `ValidationPipe` with whitelist + implicit conversion, and `app.setGlobalPrefix('api/v1')`.
- **Response shape:** Controllers commonly return `{ success: boolean, message?: string, data?: any }`. Services may return structured DTOs (see respective `src/<module>/dto` directories).
- **Error handling:** NestJS HTTP exceptions with semantic status codes (`BadRequestException`, `NotFoundException`, etc.). Validation failures are surfaced automatically by the global pipe.

---

## 2. Cross-Cutting Concerns

| Concern | Details |
| --- | --- |
| Authentication | JSON Web Tokens issued by AuthService; enforced via `JwtAuthGuard`. Optional visibility endpoints use `OptionalJwtAuthGuard`. |
| Roles/Subjects | `user` (default), `astrologer`, `admin` (with RBAC). Astrologer context is injected via `req.user.astrologerId`. Admin flows use dedicated guards + permission decorators (`AdminAuthGuard`, `PermissionsGuard`, `@RequirePermissions`). |
| Pagination | `page` + `limit` query params with sane defaults and upper bounds (commonly 20/100). |
| DTOs | All request bodies pass through DTO classes defined under each module’s `dto/` folder. Consult these classes for exhaustive field rules. |
| File Uploads | `upload/image|video|audio` endpoints rely on Multer interceptors plus `FileValidationPipe` for mime/size constraints. Files go to S3 via `UploadService`. |

---

## 3. User-Facing REST APIs

### 3.1 Root & Health (`src/app.controller.ts`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | Returns static hello string (service heartbeat). |
| GET | `/health` | Public | Full health probe covering MongoDB + Redis connectivity with timestamps. |
| GET | `/api-health` | Public | Lightweight API liveness payload with key service routes. |

**Example – Service health**

```
GET https://api.vaidik.app/api/v1/health
```

**Response**

```
{
  "status": "OK",
  "timestamp": "2025-02-12T11:32:14.082Z",
  "service": "Vaidik Talk Backend API",
  "version": "1.0.0",
  "environment": "production",
  "database": { "status": "connected", "name": "MongoDB" },
  "cache": { "status": "connected", "name": "Redis" }
}
```

### 3.2 Customer Authentication (`src/auth/auth.controller.ts`)

| Method | Path | Body DTO | Auth | Notes |
| --- | --- | --- | --- | --- |
| POST | `/auth/send-otp` | `SendOtpDto` | Public | Request login OTP. |
| POST | `/auth/resend-otp` | `SendOtpDto` | Public | Resend OTP with rate limiting handled in service. |
| POST | `/auth/verify-otp` | `VerifyOtpDto` | Public | Verify OTP and register/login device (`fcmToken`, `deviceId`, `deviceType`, `deviceName`). |
| POST | `/auth/refresh` | `RefreshTokenDto` | Public | Issue new JWT/refresh pair. |
| POST | `/auth/logout` | Guarded (`JwtAuthGuard`) | Revokes current session + devices. |
| GET | `/auth/profile` | Guarded | Returns authenticated user profile subset. |
| GET | `/auth/check` | Guarded | Token validity probe (returns `authenticated: true`). |
| GET | `/auth/methods` | Public | Exposes enabled authentication methods. |
| POST | `/auth/verify-truecaller` | `TruecallerVerifyDto` | Public | OAuth flow for Truecaller sign-in including device context. |
| GET | `/auth/truecaller/config` | Public | Exposes frontend config/feature toggle for Truecaller integration. |
| GET | `/auth/truecaller/test` | Public | Sanity endpoint for verifying stored credentials. |

**Example – Verify OTP**

```
POST https://api.vaidik.app/api/v1/auth/verify-otp
Content-Type: application/json

{
  "phoneNumber": "9876543210",
  "countryCode": "+91",
  "otp": "123456",
  "fcmToken": "fcm-xyz",
  "deviceId": "ios-15-pro-max",
  "deviceType": "ios",
  "deviceName": "iPhone"
}
```

**Response**

```
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "id": "65f0...", "name": "Aditi" },
    "tokens": {
      "accessToken": "eyJhbGci...",
      "refreshToken": "eyJhbGci..."
    },
    "isNewUser": false
  }
}
```

### 3.3 Astrologer Authentication (`src/auth/controllers/astrologer-auth.controller.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/astrologer/check-phone` | Verifies if phone belongs to approved astrologer. |
| POST | `/auth/astrologer/send-otp` | OTP request for astrologer login. |
| POST | `/auth/astrologer/verify-otp` | Completes astrologer login, returns tokens + astrologer profile metadata. |
| POST | `/auth/astrologer/refresh` | Token refresh. |
| POST | `/auth/astrologer/logout` | Guarded; invalidates astrologer session (optional `deviceId`). |
| POST | `/auth/astrologer/me` | Guarded; returns current astrologer identity payload. |
| POST | `/auth/astrologer/verify-truecaller` | Truecaller OAuth for astrologer onboarding/login. |

**Example – Astrologer OTP login**

```
POST /api/v1/auth/astrologer/verify-otp
Content-Type: application/json

{
  "phoneNumber": "9191919191",
  "countryCode": "+91",
  "otp": "442211"
}
```

**Response**

```
{
  "success": true,
  "data": {
    "astrologer": {
      "id": "64fc...",
      "name": "Astro Meera"
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
}
```

### 3.4 Astrologer Registration (`src/registration/registration.controller.ts`)

Public endpoints supporting candidate onboarding:

| Method | Path | DTO | Description |
| --- | --- | --- | --- |
| POST | `/registration/otp/send` | `SendOtpDto` | Sends OTP to candidate’s phone. |
| POST | `/registration/otp/verify` | `VerifyOtpDto` | Validates OTP for registration intent. |
| POST | `/registration/register` | `RegisterDto` | Submits candidate profile, documents, and preferences. |
| GET | `/registration/status/ticket/:ticketNumber` | — | Track application via ticket number. |
| GET | `/registration/status/phone` | `phoneNumber`, `countryCode` query params | Track via phone. |

**Example – Register astrologer candidate**

```
POST /api/v1/registration/register

{
  "fullName": "Ananya Sharma",
  "email": "astro.ananya@example.com",
  "phoneNumber": "9988776655",
  "countryCode": "+91",
  "experienceYears": 6,
  "specializations": ["vedic", "tarot"],
  "languages": ["hi", "en"],
  "documents": {
    "idProofUrl": "https://s3.../id-proof.png",
    "profileVideoUrl": "https://s3.../intro.mp4"
  }
}
```

**Response**

```
{
  "success": true,
  "data": {
    "ticketNumber": "REG-2024-0451",
    "status": "submitted"
  }
}
```

### 3.5 User Profiles & Preferences (`src/users/controllers/*.ts`)

#### `UsersController`

All routes require `JwtAuthGuard`.

| Path | Method | Summary |
| --- | --- | --- |
| `/users/profile` | GET | Current profile snapshot. |
| `/users/profile` | PATCH | Update profile fields (`UpdateProfileDto`). |
| `/users/preferences` | GET/PATCH | Read & update communication/experience preferences (`UpdatePreferencesDto`). |
| `/users/wallet` | GET | Wallet balance summary. |
| `/users/favorites` | GET | Astrologers marked as favorites. |
| `/users/favorites/:astrologerId` | POST/DELETE | Add/remove favorite astrologers. |
| `/users/statistics` | GET | Consultation usage stats. |
| `/users/account` | DELETE | Soft-delete user account. |

**Example – Update profile**

```
PATCH /api/v1/users/profile
Authorization: Bearer <token>

{
  "name": "Aditi Rao",
  "gender": "female",
  "dob": "1994-08-12",
  "appLanguage": "en"
}
```

**Response**

```
{
  "success": true,
  "data": {
    "id": "65f0...",
    "name": "Aditi Rao",
    "gender": "female",
    "appLanguage": "en"
  }
}
```

#### `UserBlockingController`

| Path | Method | Payload | Description |
| --- | --- | --- | --- |
| `/users/blocking/block` | POST | `{ astrologerId, reason }` | Block an astrologer (handles ObjectId coercion). |
| `/users/blocking/unblock/:astrologerId` | DELETE | — | Remove block. |
| `/users/blocking/list` | GET | — | All blocked astrologers. |
| `/users/blocking/check/:astrologerId` | GET | — | Returns `{ isBlocked }`. |

**Example – Block astrologer**

```
POST /api/v1/users/blocking/block
Authorization: Bearer <token>

{
  "astrologerId": "64fbb0a3c7...",
  "reason": "Advice felt inappropriate"
}
```

**Response**

```
{
  "success": true,
  "message": "Astrologer blocked",
  "data": {
    "blockedAstrologerId": "64fbb0a3c7..."
  }
}
```

### 3.6 Astrologer Discovery & Self-Service

#### Public Catalog (`src/astrologers/controllers/astrologers.controller.ts`)

Endpoints support optional authentication via `OptionalJwtAuthGuard` to tailor results (favorites, blocking, user-specific rates).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/astrologers/search` | Rich filtering via `SearchAstrologersDto` (specializations, price, rating, languages, etc.). |
| GET | `/astrologers/filter-options` | Returns static filter metadata. |
| GET | `/astrologers` | Legacy/all astrologers (same DTO as search). |
| GET | `/astrologers/featured` | Hand-curated list (`limit` 1-50). |
| GET | `/astrologers/top-rated` | Sorted by rating. |
| GET | `/astrologers/online` | Currently online astrologers. |
| GET | `/astrologers/live` | Live streaming astrologers. |
| GET | `/astrologers/specialization/:specialization` | Filter by specialization slug. |
| GET | `/astrologers/random` | Randomized sampling (1-20). |
| GET | `/astrologers/:astrologerId` | Detailed profile (honors blocking rules). |

**Example – Search astrologers**

```
GET /api/v1/astrologers/search?specializations=tarot&languages=en&minRating=4.5&page=1&limit=12
Authorization: Bearer <token optional>
```

**Response excerpt**

```
{
  "success": true,
  "data": {
    "items": [
      { "id": "64fc...", "name": "Guru Saanvi", "rating": 4.9, "languages": ["en","hi"] }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 87 }
  }
}
```

#### Astrologer Workspace (`src/astrologers/controllers/astrologer-profile.controller.ts`)

All endpoints require astrologer-authenticated JWT.

- **Profile & Pricing:** `GET/GET profile`, `PATCH profile`, `PATCH profile/pricing`.
- **Availability:** `GET astrologer/availability`, `PATCH profile/working-hours`, `PATCH availability`, `POST status/online`, `POST status/available`.
- **Live streaming toggles:** `POST live/start`, `POST live/stop`, `GET live/status`.
- **Profile changes:** `POST profile/change-request`, `GET profile/change-requests`.
- **Earnings summary:** `GET earnings`.

**Example – Update availability**

```
PATCH /api/v1/astrologer/availability
Authorization: Bearer <astrologer token>

{
  "status": "available",
  "message": "Online till 11 PM",
  "autoAcceptChat": true,
  "autoAcceptCall": false
}
```

**Response**

```
{
  "success": true,
  "data": {
    "astrologerId": "64fc...",
    "status": "available",
    "autoAcceptChat": true
  }
}
```

### 3.7 Chat Service (`src/chat/controllers/chat.controller.ts`)

JWT required. Major capabilities:

| Path | Method | Description |
| --- | --- | --- |
| `/chat/history` | GET | Paginated chat orders/sessions. |
| `/chat/sessions/active` | GET | Active chat sessions for user/astrologer. |
| `/chat/unread/total` | GET | Aggregated unread count. |
| `/chat/initiate` | POST (`InitiateChatDto`) | Starts chat, charges wallet. |
| `/chat/astrologer/accept` | POST (`AstrologerAcceptChatDto`) | Astrologer accepts pending request. |
| `/chat/astrologer/reject` | POST (`AstrologerRejectChatDto`) | Astrologer declines. |
| `/chat/continue` | POST | Continue chat from previous session. |
| `/chat/conversations/:orderId/messages` | GET | Messages across sessions for an order. |
| `/chat/conversations/:orderId/summary` | GET | Aggregated financial + engagement stats for a conversation. |
| `/chat/sessions/end` | POST (`EndChatDto`) | Ends active session with reason. |
| `/chat/sessions/:sessionId/messages` | GET | Session-scoped messages. |
| `/chat/sessions/:sessionId/unread` | GET | User-specific unread count. |
| `/chat/sessions/:sessionId/timer` | GET | Timer metrics (elapsed/remaining). |
| `/chat/sessions/:sessionId/starred` | GET | Starred messages in session. |
| `/chat/conversations/:orderId/starred` | GET | Starred messages across conversation. |
| `/chat/sessions/:sessionId/search?q` | GET | Full-text search inside session. |
| `/chat/messages/:messageId/star` | POST | Star a message (requires sessionId in body). |
| `/chat/messages/:messageId/star` | DELETE | Remove star. |
| `/chat/messages/:messageId/delete` | POST | Soft-delete message for sender/everyone. |

**Example – Initiate Chat**

```
POST /api/v1/chat/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "astrologerId": "64b8...",
  "astrologerName": "Guru Saanvi",
  "ratePerMinute": 35
}
```

**Success response**

```
{
  "success": true,
  "data": {
    "sessionId": "CHAT-2024-0007",
    "orderId": "ORDER-1122",
    "walletDebited": 200,
    "maxDurationMinutes": 5
  }
}
```

### 3.8 Call Service (`src/calls/controllers/calls.controller.ts`)

All JWT-protected.

| Path | Method | Description |
| --- | --- | --- |
| `/calls/stats/summary` | GET | Active vs historical counts. |
| `/calls/sessions/active` | GET | Ongoing calls. |
| `/calls/history` | GET | Paginated call history. |
| `/calls/initiate` | POST (`InitiateCallDto`) | Starts voice/video call session. |
| `/calls/astrologer/accept` | POST | Astrologer acceptance by `sessionId`. |
| `/calls/astrologer/reject` | POST | Astrologer rejection with reason. |
| `/calls/sessions/end` | POST (`EndCallDto`) | Ends call, finalizes billing. |
| `/calls/sessions/:sessionId/continue` | POST | Continue/resume call. |
| `/calls/sessions/:sessionId/cancel` | POST | User cancellation (requires reason). |
| `/calls/sessions/:sessionId` | GET | Session detail (ensures participant). |
| `/calls/sessions/:sessionId/timer` | GET | Timer metrics. |
| `/calls/sessions/:sessionId/recording` | GET | Retrieve call recording metadata if available. |
| `/calls/sessions/:sessionId/review` | POST | Attach rating/review (1-5). |
| `/calls/sessions/:sessionId/refund/request` | POST | Request refund (min 20-char reason). |
| `/calls/sessions/:sessionId/refund/status` | GET | Refund progress. |
| `/calls/sessions/:sessionId/recording/download` | POST | Generate download link (if implemented via service). |
| `/calls/sessions/:sessionId/billing/realtime` | GET | Real-time billing breakdown. |
| `/calls/sessions/:sessionId/billing/summary` | GET | Post-call billing summary. |

**Example – Request refund on call**

```
POST /api/v1/calls/sessions/SESSION123/refund/request
Authorization: Bearer <token>

{
  "reason": "Call dropped after 2 minutes, audio was inaudible."
}
```

**Typical response**

```
{
  "success": true,
  "message": "Refund request submitted",
  "data": {
    "sessionId": "SESSION123",
    "refundAmount": 180,
    "status": "pending"
  }
}
```

### 3.9 Orders (`src/orders/controllers/orders.controller.ts`)

JWT-protected.

| Path | Method | Description |
| --- | --- | --- |
| `/orders/stats/summary` | GET | Aggregate stats for user orders. |
| `/orders` | GET | Paginated orders with optional `type`/`status`. |
| `/orders/conversations` | GET | Chat/Call conversation list. |
| `/orders/conversations/:orderId/stats` | GET | Conversation analytics. |
| `/orders/:orderId` | GET | Detailed order view (sessions, payments). |
| `/orders/:orderId/consultation-space` | GET | Combined chat + call sessions under order. |
| `/orders/:orderId/recording` | GET | Access to call recording. |
| `/orders/:orderId/review` | POST (`AddReviewDto`) | Submit order-level review. |
| `/orders/:orderId/cancel` | PATCH (`CancelOrderDto`) | Cancel pending order. |
| `/orders/:orderId/refund/request` | POST (`RequestRefundDto`) | Escalate refund to support. |
| `/orders/:orderId/refund/status` | GET | Track refund. |
| `/orders/:orderId/extend` | POST (`ExtendSessionDto`) | Continue consultation (re-billing). |
| `/orders/:orderId/max-duration` | GET | Calculates available minutes based on wallet + rate. |

**Example – Cancel order**

```
PATCH /api/v1/orders/ORDER-1122/cancel
Authorization: Bearer <token>

{
  "reason": "Astrologer no-show"
}
```

**Response**

```
{
  "success": true,
  "message": "Order cancelled",
  "data": {
    "orderId": "ORDER-1122",
    "status": "cancelled"
  }
}
```

### 3.10 Payments & Wallet

#### Wallet (`src/payments/controllers/wallet.controller.ts`)

| Path | Method | Description |
| --- | --- | --- |
| `/wallet/stats` | GET | Wallet balances (usable, bonus, hold). |
| `/wallet/stats/with-hold` | GET | Includes hold/reserved info. |
| `/wallet/payment-logs` | GET | Recharge/payment attempts filtered by status. |
| `/wallet/recharge` | POST (`RechargeWalletDto`) | Creates Razorpay order for recharge. |
| `/wallet/verify-payment` | POST (`VerifyPaymentDto`) | Confirms Razorpay payment and credits wallet. |
| `/wallet/redeem-giftcard` | POST | Redeems stored-value code. |
| `/wallet/transactions` | GET | Paginated ledger with optional `type`/`status`. |
| `/wallet/transactions/:transactionId` | GET | Single transaction detail. |
| `/wallet/gifts/direct` | POST (`SendDirectGiftDto`) | Send gift to astrologer outside streams. |

**Example – Recharge wallet**

```
POST /api/v1/wallet/recharge
Authorization: Bearer <token>

{
  "amount": 1000,
  "currency": "INR"
}
```

**Response**

```
{
  "success": true,
  "data": {
    "transactionId": "WALLET-RECH-24001",
    "razorpayOrderId": "order_O6Q...",
    "amount": 1000,
    "status": "pending_payment"
  }
}
```

#### Astrologer Payouts (`src/payments/controllers/astrologer-payout.controller.ts`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/astrologer/payouts` | Submit payout request (`RequestPayoutDto`) referencing bank details. |
| GET | `/astrologer/payouts` | Paginate payout history with optional `status`. |
| GET | `/astrologer/payouts/:payoutId` | Detail view. |
| GET | `/astrologer/payouts/stats/summary` | Earnings vs withdrawn summary. |

**Example – Request payout**

```
POST /api/v1/astrologer/payouts
Authorization: Bearer <astrologer token>

{
  "amount": 15000,
  "bankDetails": {
    "accountHolder": "Astro Meera",
    "accountNumber": "XXXXXX1234",
    "ifsc": "HDFC0001234"
  }
}
```

**Response**

```
{
  "success": true,
  "data": {
    "payoutId": "PAYOUT-2024-0031",
    "status": "pending",
    "amount": 15000
  }
}
```

#### Payment Webhooks (`src/payments/controllers/payment-webhook.controller.ts`)

- `POST /webhooks/payment/razorpay`: Processes Razorpay events (currently `payment.captured`) and triggers wallet verification.

### 3.11 Notifications (`src/notifications/controllers/notification.controller.ts`)

JWT required. Device management + notification inbox.

- `DELETE /notifications/unregister-device` — Remove FCM token from user/astrologer document.
- `POST /notifications/devices` — Returns all devices with masked tokens.
- `POST /notifications/devices/:deviceId/deactivate` — Mark device as inactive.
- `GET /notifications` — Paginated inbox with optional `unreadOnly=true`.
- `GET /notifications/unread-count` — Count of unread notifications.
- `PATCH /notifications/mark-read` — Body `MarkReadDto` containing `notificationIds`.
- `PATCH /notifications/mark-all-read` — Marks all as read for user.
- `DELETE /notifications/:notificationId` — Delete single notification.
- `DELETE /notifications/clear-all` — Purge inbox.

**Example – Fetch notifications**

```
GET /api/v1/notifications?page=1&limit=10&unreadOnly=true
Authorization: Bearer <token>
```

**Response**

```
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "notif_1",
        "title": "Your chat session is starting",
        "isRead": false
      }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 4 }
  }
}
```

### 3.12 Remedies (`src/remedies/controllers/*.ts`)

#### User Remedies (`/remedies`)

Endpoints allow users to view and manage recommended remedies per order.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/remedies` | All remedies with `status`/`type` filters. |
| GET | `/remedies/by-order/:orderId` | Remedy list scoped to order. |
| GET | `/remedies/:remedyId` | Details including astrologer notes, Shopify items. |
| PATCH | `/remedies/:remedyId/status` | Accept/reject purchase recommendation (`UpdateRemedyStatusDto`). |
| GET | `/remedies/stats/summary` | High-level stats. |
| GET | `/remedies/suggested` | Tab of pending suggestions. |
| GET | `/remedies/purchased` | Completed purchases. |
| GET | `/remedies/orders-with-remedies` | Orders where remedies exist. |

**Example – Accept remedy**

```
PATCH /api/v1/remedies/REM-7788/status
Authorization: Bearer <token>

{
  "status": "accepted",
  "notes": "Will buy this week"
}
```

**Response**

```
{
  "success": true,
  "data": {
    "remedyId": "REM-7788",
    "status": "accepted"
  }
}
```

#### Astrologer Remedies (`/astrologer/remedies`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `suggest-manual/:userId/:orderId` | Manual textual remedy suggestion. |
| POST | `suggest-product/:userId/:orderId` | Suggest Shopify product by ID. |
| POST | `suggest-bulk/:userId/:orderId` | Suggest multiple Shopify products at once. |
| GET | `/` | Remedies suggested by astrologer (filters). |
| GET | `/stats/summary` | Astrologer performance stats. |
| GET | `/users/:userId/shopify-orders` | Access user’s Shopify order history for context. |

**Example – Suggest Shopify product**

```
POST /api/v1/astrologer/remedies/suggest-product/USER123/ORDER456
Authorization: Bearer <astrologer token>

{
  "shopifyProductId": "gid://shopify/Product/123456789",
  "title": "White Sage Kit",
  "description": "Helps cleanse energy post consultation",
  "price": 799
}
```

**Response**

```
{
  "success": true,
  "data": {
    "remedyId": "REM-9021",
    "type": "shopify_product",
    "status": "suggested"
  }
}
```

### 3.13 Reports (`src/reports/controllers/*.ts`)

#### User (`/reports`)

- `GET /reports` — Paginated user reports (status/type filters).
- `GET /reports/:reportId` — Single report.
- `GET /reports/:reportId/download` — Download/URL retrieval.
- `GET /reports/stats/summary` — Stats such as completed/pending counts.

**Example – Get report details**

```
GET /api/v1/reports/REP-2201
Authorization: Bearer <token>
```

**Response**

```
{
  "success": true,
  "data": {
    "id": "REP-2201",
    "title": "2025 Career Overview",
    "status": "completed",
    "downloadUrl": "https://s3.../REP-2201.pdf"
  }
}
```

#### Astrologer (`/astrologer/reports`)

- `POST /` — Create custom report (`CreateReportDto`).
- `GET /` — List authored reports.
- `PATCH /:reportId` — Update content (`UpdateReportDto`).
- `DELETE /:reportId` — Remove draft.
- `GET /stats/summary` — Aggregated performance metrics.

**Example – Create report**

```
POST /api/v1/astrologer/reports
Authorization: Bearer <astrologer token>

{
  "userId": "USER123",
  "orderId": "ORDER456",
  "title": "Detailed Kundli Analysis",
  "sections": [
    { "heading": "Career", "content": "Expect leadership role Q3." }
  ],
  "deliveryEtaHours": 12
}
```

**Response**

```
{
  "success": true,
  "data": {
    "reportId": "REP-9031",
    "status": "draft"
  }
}
```

### 3.14 Streaming (`src/streaming/controllers/*.ts`)

#### Public/User Streams (`StreamController`)

| Path | Method | Auth | Description |
| --- | --- | --- | --- |
| `/streams/live` | GET | Public | Current live streams (paginated). |
| `/streams/scheduled` | GET | Public | Upcoming scheduled streams. |
| `/streams/:streamId` | GET | Public | Details incl. host, schedule, entry fee. |
| `/streams/:streamId/analytics` | GET | Public | Post-stream stats (viewers, duration). |
| `/streams/:streamId/join` | POST | JWT | Join stream (issues RTC token). |
| `/streams/:streamId/leave` | POST | JWT | Leave stream. |
| `/streams/:streamId/call/request` | POST | JWT | Queue for on-stream call (`RequestCallDto`). |
| `/streams/:streamId/call/cancel` | POST | JWT | Cancel call request. |
| `/streams/:streamId/call/mode` | POST | JWT | Switch between public/private call. |
| `/streams/:streamId/call/toggle-camera` | POST | JWT | Toggle user camera. |
| `/streams/:streamId/gifts` | POST | JWT | Send virtual gift (`SendGiftDto`). |
| `/streams/:streamId/call/end-user-call` | POST | JWT | End caller’s own session. |

**Example – Join stream**

```
POST /api/v1/streams/STREAM-1002/join
Authorization: Bearer <token>
```

**Response**

```
{
  "success": true,
  "data": {
    "viewerToken": "vg-abc123",
    "stream": {
      "id": "STREAM-1002",
      "title": "Love Advice Live",
      "host": "Astro Meera"
    }
  }
}
```

#### Astrologer Stream Management (`AstrologerStreamController`)

Full CRUD for hosting streams plus waitlist controls:

- `POST /astrologer/streams` — Create (`CreateStreamDto`).
- `GET /astrologer/streams` — List own streams (`status`, paging).
- `POST /astrologer/streams/:streamId/start|end` — Toggle live state.
- `PATCH /astrologer/streams/:streamId` — Update metadata (`UpdateStreamDto`).
- `DELETE /astrologer/streams/:streamId` — Remove upcoming stream.
- `POST /astrologer/streams/:streamId/controls/mic|camera|switch-camera` — Toggle hardware states.
- `PATCH /astrologer/streams/:streamId/call-settings` — Update call pricing/duration (`UpdateCallSettingsDto`).
- `GET /astrologer/streams/:streamId/waitlist` — View queue.
- `POST /astrologer/streams/:streamId/waitlist/:userId/accept|reject` — Manage callers.
- `POST /astrologer/streams/:streamId/call/end` — End ongoing call.
- `GET /astrologer/streams/:streamId/analytics` & `GET /astrologer/streams/analytics/summary` — Performance metrics.

**Example – Create stream**

```
POST /api/v1/astrologer/streams
Authorization: Bearer <astrologer token>

{
  "title": "Daily Panchang Insights",
  "description": "30-min daily session",
  "streamType": "public",
  "entryFee": 0,
  "scheduledAt": "2025-02-14T17:30:00Z",
  "thumbnailUrl": "https://s3.../thumb.png"
}
```

**Response**

```
{
  "success": true,
  "data": {
    "streamId": "STREAM-2050",
    "status": "scheduled"
  }
}
```

#### Admin Stream Oversight (`src/streaming/controllers/admin-stream.controller.ts`)

Admin-only dashboards:

- `GET /admin/streams` — Paginated stream registry.
- `GET /admin/streams/stats` — Summary totals.
- `GET /admin/streams/live` — Active streams info.
- `GET /admin/streams/:streamId` — Detail view.
- `POST /admin/streams/:streamId/force-end` — Terminate problematic live streams.
- `GET /admin/streams/:streamId/analytics` — Deep analytics.
- `GET /admin/streams/analytics/top-streams|top-earners` — Leaderboards.
- `GET /admin/streams/:streamId/viewer-token` — Generate viewer tokens for QA.

### 3.15 Support (`src/support/controllers/*.ts`)

#### Customer/Astrologer Support (`/support`)

All routes use `JwtAuthGuard`.

- `GET /support/categories` — Category list tailored by user type.
- `POST /support/tickets` — Creates Zoho Desk ticket with contextual metadata (`CreateTicketDto`). Auto-builds description with wallet/transaction/payout context.
- `GET /support/tickets` — Lists user’s existing tickets with status, Zoho chat URL, refund/payout flags.

**Example – Create support ticket**

```
POST /api/v1/support/tickets
Authorization: Bearer <token>

{
  "category": "refund",
  "subject": "Charged twice for the same order",
  "transactionId": "WALLET-2024-0099",
  "requestedAmount": 599
}
```

**Response**

```
{
  "success": true,
  "message": "Support ticket created successfully",
  "data": {
    "ticketId": "65f3c0...",
    "ticketNumber": "ZT-2315",
    "zohoTicketId": "549208000012345678",
    "chatUrl": "https://desk.zoho.com/.../tickets/549208000012345678"
  }
}
```

#### Admin Support Ops (`/admin/support/tickets`)

All guarded by `AdminAuthGuard + PermissionsGuard` with granular permissions.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | List/filter tickets by status/category/user type/search. |
| GET | `/stats` | Dashboard metrics (open, in-progress, refund pending, etc.). |
| GET | `/:ticketId` | Detailed ticket including related transactions/payouts + prior tickets. |
| POST | `/:ticketId/process-refund` | Processes refunds either via Razorpay or wallet credit (`ProcessRefundDto`). |
| POST | `/:ticketId/approve-payout` | Approves payout-related tickets. |
| POST | `/:ticketId/reject-refund` | Marks refund requests as rejected (updates Zoho). |
| POST | `/:ticketId/reject-payout` | Reject payout request w/ notes. |
| POST | `/:ticketId/status` | Manual status updates (open/in_progress/resolved/closed). |
| POST | `/:ticketId/add-note` | Adds admin note with audit trail. |

#### Zoho Webhook (`src/support/controllers/zoho-webhook.controller.ts`)

- `POST /webhooks/zoho/ticket-update` — Accepts Zoho Desk webhook to keep statuses in sync (maps Zoho statuses to internal ones).

### 3.16 Upload Service (`src/upload/controllers/upload.controller.ts`)

Public but guarded at gateway level (ensure CDN or API gateway handles auth if required).

| Method | Path | Constraints | Description |
| --- | --- | --- | --- |
| POST | `/upload/image` | ≤5 MB; jpg/jpeg/png/webp/gif | Uploads to S3. Returns URL, key, metadata. |
| POST | `/upload/video` | ≤100 MB; mp4/mpeg/mov/avi/mkv | Upload video assets. |
| POST | `/upload/audio` | ≤10 MB; mp3/mpeg/wav/m4a/aac/ogg | Upload audio. |
| DELETE | `/upload/delete` | Body `{ url }` | Delete by full URL. |
| DELETE | `/upload/delete-by-key` | Body `{ key }` | Delete by S3 key. |

**Example – Upload image**

```
POST /api/v1/upload/image
Authorization: Bearer <token>
Content-Type: multipart/form-data
file=<jpeg binary>
```

**Response**

```
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "url": "https://s3.../images/1707908123-profile.jpg",
    "s3Key": "images/1707908123-profile.jpg",
    "size": 431228
  }
}
```

### 3.17 Shopify Integration (`src/shopify/controllers/*.ts`)

- **Orders (`/shopify`)**: `POST /sync-orders` (Syncs using `SyncShopifyOrdersDto`), `GET /orders`, `GET /orders/:orderId`.
- **Search (`/shopify/search`)**: Authenticated product search for astrologers using `SearchProductsDto`.
- **Products (`/shopify/products`)**: Public storefront endpoints to fetch categories, search, get by ID, or batch fetch by IDs.
- **Webhooks (`/shopify/webhooks/orders/create`)**: Receives order creation events, verifies HMAC signature, and delegates to `ShopifyWebhookService`.

**Example – Sync Shopify orders**

```
POST /api/v1/shopify/sync-orders
Authorization: Bearer <token>

{
  "phoneNumber": "9876543210",
  "countryCode": "+91",
  "force": true
}
```

**Response**

```
{
  "success": true,
  "data": {
    "syncedOrders": 12,
    "lastSyncedAt": "2025-02-10T09:45:00Z"
  }
}
```

### 3.18 Notifications & Device Management

See §3.11 above for endpoints.

---

## 4. Admin APIs

All admin routes live under `/admin/*`, require `AdminAuthGuard`, and often `PermissionsGuard` with constants from `Permissions` config. Highlights:

| Module | Controller | Key Endpoints |
| --- | --- | --- |
| Authentication | `admin/auth` | `POST /login`, `POST /logout`, `GET /profile`, `POST /change-password`, `POST /create-admin`, `GET /verify-token`, `POST /refresh-token`. |
| Admin Management | `admin/admins` | CRUD for admin users, status toggles, stats, deletion. |
| User Management | `admin/users` | List/search users, live active count, per-user activity, wallet adjustments, soft-delete/restore, export CSV. |
| Astrologer Management | `admin/astrologers` & `admin/registrations` | Manage astrologer approvals, stats, pricing/bio updates, shortlist/reject registration rounds, interview completions. |
| Orders | `admin/orders` | Paginate all orders, stats, revenue, pending refunds, manual cancellations/refunds. |
| Payments | `admin/payments` | Monitor wallet transactions, payout queues (approve/reject), wallet refunds processing, gift card CRUD. |
| Notifications | `admin/notifications` | Broadcast push notifications (users/astrologers/specific recipients), follower notifications, scheduling, live event alerts, system messages, force-logout actions, schedule CRUD. |
| Reviews Moderation | `admin/reviews` | List reviews, stats, approve/reject/flag. |
| Reports | `admin/reports` | Revenue/users/astrologers/orders/payments analytics with export endpoints and dashboard summary. |
| Analytics Dashboard | `admin/analytics/dashboard` | Aggregated KPIs across modules. |
| Activity Logs | `admin/activity-logs` | Paginated logs (global, my activities, per-admin, per-module, failures). |
| Monitoring | `admin/monitoring` | Health summary, consolidated dashboards for Shopify orders, remedies, user journeys, astrologer activity, real-time metrics/errors. |
| Support Ops | `admin/support/tickets/*` | Detailed in §3.15. |
| Streams (Admin) | `admin/streams/*` | Force-end and analytics (see §3.14). |

Each admin endpoint references DTOs under `src/admin/features/**/dto`. Permissions are declared via `@RequirePermissions(Permissions.<ACTION>)`.

**Example – Admin login**

```
POST /api/v1/admin/auth/login

{
  "email": "ops@vaidik.app",
  "password": "StrongP@ssw0rd"
}
```

**Response**

```
{
  "success": true,
  "data": {
    "adminId": "admin_45",
    "roleType": "super_admin",
    "token": "eyJhbGciOi..."
  }
}
```

---

## 5. Integrations & Webhooks

| Integration | Endpoint | Notes |
| --- | --- | --- |
| Shopify Orders | `POST /shopify/webhooks/orders/create` | Requires raw body for HMAC verification; handled by `ShopifyWebhookService`. |
| Razorpay Payments | `POST /webhooks/payment/razorpay` | Confirms captured payments and reconciles wallet transactions. |
| Zoho Desk Tickets | `POST /webhooks/zoho/ticket-update` | Updates local ticket status based on Zoho payload. |

---

## 6. Real-Time Gateways

- **Chat Gateway (`src/chat/gateways/chat.gateway.ts`)**: Socket.io namespace for chat messaging, typing indicators, read receipts, message delivery events.
- **Call Gateway (`src/calls/gateways/calls.gateway.ts`)**: Handles signaling for live audio/video calls, timer updates, and billing ticks.
- **Notifications Gateway (`src/notifications/gateways/...`)**: Pushes high-priority alerts/device updates.
- **Streaming Gateway (`src/streaming/gateways/...`)**: Publishes viewer counts, gift events, call waitlist updates.

> Refer to the gateway files for event names, payload contracts, and lifecycle hooks (`@SubscribeMessage`). Authentication generally reuses JWT via Socket guards.

---

## 7. DTO & Schema References

- **DTOs:** Located in each module’s `dto/` folder (e.g., `src/auth/dto/send-otp.dto.ts`). Each DTO combines `class-validator` decorators that define required fields, formats, and enums.
- **Schemas:** Stored under `schemas/` directories. Key documents include `User`, `Astrologer`, `Order`, `ChatSession`, `CallSession`, `WalletTransaction`, `PayoutRequest`, `SupportTicket`, etc.
- **Services:** Business logic lives in `services/` folders and should be consulted for side effects such as wallet debits, notifications, analytics logging, and integrations.

---

## 8. Usage Notes

1. **Idempotency:** Re-initiation endpoints (chat/call continue, refund requests) guard against duplicates inside services; nonetheless, clients should debounce UI actions.
2. **Time-sensitive flows:** OTPs, streaming, and live call endpoints rely on server timeouts; clients must handle `HttpStatus.BAD_REQUEST` for expired contexts.
3. **Auditing:** Admin and support actions are logged via dedicated services; ensure to pass `CurrentAdmin` metadata when extending controllers.
4. **Extensibility:** Global pipes enable request transformation, so ensure query/body values respect DTO field names to leverage implicit conversion.

For deeper dives, follow the import graph from each controller into services and DTOs to understand side effects (wallet mutations, notifications, background jobs, etc.).

---

_Last updated: generated automatically from repository state on request._

