# OpenX — Unlimited AI. No login. No limits.

A fully free, unlimited AI chat platform. No login, no signup, instant access.
Powered by the **ShivanshAI-1.1** model with streaming responses, Markdown
rendering, a reasoning ("Thinking") panel, real-time web search, dark/light
mode, and local-only chat history.

Made by **Shivansh Rai**.

---

## 🔐 How your API key stays private (important)

OpenX uses a **server-side secret key** that is **never** pushed to GitHub:

| Where | Is the key visible? |
|-------|---------------------|
| GitHub repo (code) | ❌ No key anywhere |
| `.env` (your machine) | ✅ gitignored — never committed |
| `.env.example` (in repo) | ❌ Placeholder only (`your-key-here`) |
| Vercel Environment Variables | ✅ Secret — only the server can read it |
| Website visitors / browser | ❌ Never see it, never see "SHIVANSH_API_KEY" |

The model shown to users is always **ShivanshAI-1.1**. The real backend engine
and its provider are abstracted away on the server — visitors only ever see the
ShivanshAI brand.

> You **cannot** bake a key into the code and also hide it from people who
> download the code. The secure way is exactly what this repo does: the key
> lives in a gitignored `.env` locally and a secret Environment Variable on
> Vercel. Everyone who visits your **deployed** site gets working AI powered by
> your key — but nobody can steal it.

---

## 💻 Run locally

**Prerequisites:** Node.js 18+ (from [nodejs.org](https://nodejs.org)).

```bash
# 1. Install dependencies
npm install

# 2. Create your private env file from the example
cp .env.example .env

# 3. Open .env and paste your key on the SHIVANSHAI_API_KEY line, e.g.
#    SHIVANSHAI_API_KEY="nvapi-xxxxxxxx"
#    SHIVANSHAI_API_URL="https://integrate.api.nvidia.com/v1"

# 4. Start the dev server
npm run dev
```

Open 👉 **http://localhost:3000**

> Your `.env` file is ignored by Git, so the key inside it is never uploaded.

---

## 🐙 Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: OpenX"
git branch -M main
git remote add origin https://github.com/<your-username>/openx.git
git push -u origin main
```

**Verify the key is safe** before pushing — `.env` should NOT appear:

```bash
git status            # .env must be absent from tracked files
cat .gitignore        # confirms .env is ignored
```

If `.env` ever shows up as a tracked file, do **not** push. Re-check `.gitignore`.
(If it was already pushed by mistake, rotate/regenerate your API key immediately.)

---

## ▲ Deploy to Vercel (free)

1. Go to **[vercel.com](https://vercel.com)** → sign in with GitHub.
2. **Add New… → Project** → import your `openx` repo.
3. Vercel auto-detects Next.js. Under **"Environment Variables"**, add:
   - Name: `SHIVANSHAI_API_KEY` · Value: *your key* · ✅ keep secret
   - Name: `SHIVANSHAI_API_URL` · Value: `https://integrate.api.nvidia.com/v1`
4. Click **Deploy**. Done! 🎉

Your site is now live. Every visitor chats with **ShivanshAI-1.1**, powered by
your private key — and nobody can see it.

### Optional: connect to a database
Not required. OpenX stores all chat history in the browser (`localStorage`).
The `/api/health` check works with or without a database. If you want the DB
health check on Vercel, add a `DATABASE_URL` env var (e.g. from Neon/Supabase).

---

## ✨ Features

- **ShivanshAI-1.1** branding (backend engine fully abstracted)
- **Streaming** responses with a collapsible **Thinking** (reasoning) panel
- **Real-time web search** via DuckDuckGo (free, no key) — toggle the 🌐 button
- **Markdown** rendering + syntax-highlighted code blocks with copy buttons
- Collapsible glassmorphism **sidebar** with search, rename, delete
- **Dark mode** by default + light toggle (no flash on load)
- **Copy** and **Regenerate** buttons, stop generation, graceful error fallback
- **Mobile responsive** with a drawer sidebar
- No auth, no rate limits, history saved locally
