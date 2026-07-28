# 05 — API Design

Base: `/api/v1`. JSON in / JSON out. JWT in `Authorization: Bearer <token>`.
Standard response: `{ success, data, message }`. Errors: `{ success: false, message, errors[] }`.

## Auth
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | returns JWT + user |
| GET | `/auth/me` | any | current user |
| POST | `/auth/change-password` | any | |

## Users (Admin only)
`GET /users` · `POST /users` · `PATCH /users/:id` · `PATCH /users/:id/deactivate`

## Parties
| Method | Path | Notes |
|---|---|---|
| GET | `/parties?type=&search=&page=` | list, includes computed `balance` |
| POST | `/parties` | |
| GET | `/parties/:id` | |
| PATCH | `/parties/:id` | opening balance editable **only if** no posted entries exist |
| GET | `/parties/:id/ledger?from=&to=` | the Khata — computed running balance |
| GET | `/parties/outstanding` | all parties with non-zero balance |

## Products
| Method | Path | Notes |
|---|---|---|
| GET | `/products?search=&category=` | includes computed `currentStock` |
| POST | `/products` | |
| GET | `/products/:id` | |
| PATCH | `/products/:id` | `costRate` Admin only |
| GET | `/products/:id/stock-card?from=&to=` | every movement of one product |

## Expense heads
`GET /expense-heads` · `POST /expense-heads` · `PATCH /expense-heads/:id`

## Day Book  ⭐
| Method | Path | Notes |
|---|---|---|
| GET | `/daybook/:date` | returns DRAFT/POSTED day + computed `openingCash`; creates an empty draft if none |
| PUT | `/daybook/:date` | save the whole day (all 5 sections) as DRAFT |
| POST | `/daybook/:date/post` | validate + post (atomic). Admin/Operator |
| POST | `/daybook/:date/unpost` | **Admin only** |
| GET | `/daybook?from=&to=&status=` | list of days |

> The Day Book is saved as **one document**, not 5 separate endpoints. This keeps the day atomic and matches the paper sheet.

## Stock
| Method | Path | Notes |
|---|---|---|
| GET | `/stock/current` | all products with current stock |
| POST | `/stock/adjustment` | Admin only, requires `reason` |
| GET | `/stock/adjustments?from=&to=` | |

## Reports
| Method | Path | Notes |
|---|---|---|
| GET | `/reports/daily-sale?date=` | the Daily Sale & Expense Sheet |
| GET | `/reports/daily-stock?date=` | Opening/Purchase/Sale/Closing per product |
| GET | `/reports/ledger?partyId=&from=&to=` | |
| GET | `/reports/monthly-sale?month=&year=` | |
| GET | `/reports/profit?from=&to=` | **Admin only** |
| GET | `/reports/expenses?from=&to=&headId=` | |
| GET | `/reports/cashbook?from=&to=` | |

## Dashboard
`GET /dashboard/summary?date=` → today's sale, profit (admin), expense, cash in hand, credit sale, receivable, payable, low stock.

## Cross-cutting rules
- **Role filtering happens server-side.** For an `OPERATOR`, the API must strip `profit`, `costRate`, and block `/reports/profit`. Never rely on the frontend to hide it.
- All list endpoints: `page`, `limit`, `sort`.
- All date params: `YYYY-MM-DD`, interpreted in the shop's local timezone (`Asia/Karachi`), stored as UTC.
- Validation with Zod (or Joi) at the route boundary; business logic lives in a `services/` layer, not in controllers.
