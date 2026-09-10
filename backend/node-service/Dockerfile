# Multi-stage so local development and the deployed image can differ
# without maintaining two Dockerfiles.
#
# IMPORTANT: `production` must stay the LAST stage. render.yaml builds
# this file with no `target`, and Docker defaults to the final stage - a
# stage added below it would silently become what gets deployed.

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# Development image, used by infra/docker-compose.yml via `target: dev`.
# Installs the full dependency tree (nodemon lives in devDependencies)
# and deliberately does NOT copy src/ in - compose bind-mounts the host's
# src/ over /app/src instead, so an edit is picked up by nodemon
# immediately rather than needing an image rebuild.
FROM base AS dev
RUN npm install
EXPOSE 4000
# --legacy-watch (polling) because inotify events don't reliably cross a
# Docker Desktop bind mount on macOS/Windows, which makes plain nodemon
# look like it simply never notices a change.
CMD ["npx", "nodemon", "--legacy-watch", "src/server.js"]

# Deployed image: production dependencies only, source baked in.
FROM base AS production
RUN npm install --omit=dev
COPY src ./src
EXPOSE 4000
CMD ["node", "src/server.js"]
