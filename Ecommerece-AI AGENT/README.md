# Aria — AI E-commerce Assistant

A full-stack e-commerce app with an AI shopping assistant built on
**LangChain + LangGraph**. Customers can browse/search the catalog
normally, or just tell the chat widget what they want ("I need a
laptop under $900", "compare iPhone 15 and Pixel 9", "track my
order") and the agent looks up real product, cart, and order data to
answer.

## Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite (dev) / PostgreSQL (prod), JWT auth
- **AI**: LangChain tools + a LangGraph workflow (intent classification → ReAct tool-calling agent) backed by a Claude model
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Deployment**: Docker Compose (Postgres, Redis, backend, frontend behind nginx)

## Project structure

```
ecommerce-ai/
├── backend/
│   ├── app/
│   │   ├── agents/       # LangGraph shopping agent workflow
│   │   ├── tools/        # LangChain tools (product, cart, order, misc)
│   │   ├── api/          # FastAPI routers (auth, products, cart, orders, chat, admin)
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # auth, current-user dependencies
│   │   ├── memory/       # conversation history persistence
│   │   └── rag/          # FAQ / policy knowledge base
│   ├── tests/
│   └── seed.py           # demo catalog + accounts
├── frontend/
│   └── src/
│       ├── api/          # typed fetch client
│       ├── hooks/        # auth + cart context
│       ├── components/   # Header, ProductCard, ChatWidget
│       └── pages/        # Home, ProductDetail, Cart, Orders, Login
├── docker/docker-compose.yml
└── docs/DEPLOYMENT.md
```

## Quickstart (local, no Docker)

### 1. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY to enable the AI chat endpoint
python seed.py            # creates ecommerce_ai.db with demo data
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`. Interactive API docs at
`http://localhost:8000/docs`.

Demo accounts created by `seed.py`:

| Role      | Email             | Password     |
|-----------|-------------------|--------------|
| Admin     | admin@shop.ai     | Admin123!    |
| Support   | support@shop.ai   | Support123!  |
| Customer  | demo@shop.ai      | Demo123!     |

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # points at http://localhost:8000 by default
npm run dev
```

Frontend runs at `http://localhost:5173`.

### 3. Try it

- Browse and filter products on the home page.
- Sign in (or use the demo customer account) and click **Ask Aria**
  in the bottom-right corner.
- Try: *"I need a laptop under $900"*, *"compare iPhone 15 and Pixel
  9"*, *"show me waterproof smartwatches"*, *"do you have any
  coupons?"*, *"track my order"*.

The chat endpoint requires `ANTHROPIC_API_KEY` to be set in
`backend/.env` — without it, the assistant returns a clear 503 error
explaining what's missing, but the rest of the app (browsing, cart,
checkout, orders) works regardless.

## Running with Docker

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full guide,
including Postgres setup and cloud deployment notes. Short version:

```bash
cd docker
cp ../backend/.env.example .env   # then set ANTHROPIC_API_KEY, SECRET_KEY
docker compose up --build
```

## Tests

```bash
cd backend
pytest -v
```

```bash
cd frontend
npm run build   # type-checks and builds; catches TS errors
```

## AI architecture

```
customer message
      |
      v
LangGraph: classify_intent  (labels the message for logging/analytics)
      |
      v
LangGraph: agent  (LangGraph's create_react_agent tool-calling loop)
      |            - selects one or more of 20 LangChain tools
      |            - each tool hits the real FastAPI/SQLAlchemy layer
      |              (product search, cart, orders, coupons, FAQs, etc.)
      v
LLM response generation (grounded in tool results, never invented)
      |
      v
conversation memory persisted to the `conversations` table
      |
      v
final response returned to the chat widget
```

Tools are defined per-domain in `backend/app/tools/`:

- `product_tools.py` — search, compare, recommend, inventory check, review summarization
- `cart_tools.py` — add/view/remove cart items, wishlist, coupon validation
- `order_tools.py` — order tracking, cancellation, shipping cost calculator, return policy, support tickets
- `misc_tools.py` — currency conversion, store locator, FAQ/RAG search, customer profile

Swapping the FAQ tool's keyword search (`app/rag/faq.py`) for a real
vector store (pgvector/Chroma/Pinecone) or adding semantic product
search via the `Product Embeddings` table is a drop-in replacement —
the tool interface the agent calls doesn't change.

## Notes on scope

This is a complete, working slice of the full spec: auth, catalog,
cart/wishlist/coupons, checkout, order tracking/cancellation, an
admin analytics/management API, and a real LangGraph agent with 20
tools — all tested end-to-end. Left as clearly-marked extension
points for a production rollout: payment gateway integration (the
`Payment` model and checkout flow are wired up but capture is
simulated), email delivery for password reset, and a dedicated admin
frontend UI (the admin **API** is complete in `app/api/admin.py`, but
there's no React admin dashboard yet — everything in it is reachable
via `/docs`).
"# Aria" 
