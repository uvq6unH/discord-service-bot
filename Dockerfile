# syntax=docker/dockerfile:1
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY dashboard/package.json ./dashboard/

# Install all deps (root + dashboard)
RUN pnpm install

# Build dashboard UI → public-react/
COPY dashboard/ ./dashboard/
RUN pnpm build:ui

# Copy source (node_modules đã có, chỉ cần src)
COPY src/ ./src/

# Tạo thư mục cần thiết
RUN mkdir -p logs data

EXPOSE 10000 10001