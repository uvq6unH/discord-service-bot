# syntax=docker/dockerfile:1
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate \
 && npm install -g nodemon

WORKDIR /app

# ── Root (bot) ────────────────────────────────────────────────────────────────
COPY package.json .npmrc ./
RUN pnpm install

# ── Dashboard: COPY source trước, install sau ─────────────────────────────────
COPY dashboard/ ./dashboard/
RUN cd dashboard && npm install
RUN cd dashboard && npm run build

# ── Bot source ────────────────────────────────────────────────────────────────
COPY src/ ./src/
COPY pnpm-workspace.yaml ./

RUN mkdir -p logs data

EXPOSE 10000 10001