# Pocket Cloud starter app — CEN4086
# Zero npm dependencies, so there is no `npm install` layer.
FROM node:20-alpine

WORKDIR /app
COPY server.js products.json ./
COPY public ./public

# Run as the unprivileged user the base image provides (hardening — see M3)
USER node

EXPOSE 3000

# Container-native health check: Docker/Portainer will show healthy/unhealthy
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
