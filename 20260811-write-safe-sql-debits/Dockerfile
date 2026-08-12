FROM node:22-bookworm-slim

WORKDIR /work

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY sql ./sql
COPY tests ./tests
RUN mkdir -p artifacts

CMD ["npm", "test"]
