FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
RUN npm config set registry "$NPM_CONFIG_REGISTRY" \
  && npm ci --ignore-scripts
RUN chmod +x node_modules/@ffmpeg-installer/linux-x64/ffmpeg || true

COPY . .
ARG API_PROXY_TARGET
ARG NEXT_PUBLIC_RECHARGE_WECHAT_QR_URL
ARG NEXT_PUBLIC_RECHARGE_ALIPAY_QR_URL
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
ENV NEXT_PUBLIC_RECHARGE_WECHAT_QR_URL=${NEXT_PUBLIC_RECHARGE_WECHAT_QR_URL}
ENV NEXT_PUBLIC_RECHARGE_ALIPAY_QR_URL=${NEXT_PUBLIC_RECHARGE_ALIPAY_QR_URL}
RUN npm run db:generate
RUN npm run build:web

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/app ./app
COPY --from=builder /app/src ./src
COPY --from=builder /app/server ./server
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs

EXPOSE 5173 8787

CMD ["npm", "run", "start:server"]
