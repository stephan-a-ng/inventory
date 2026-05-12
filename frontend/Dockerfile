FROM node:20-alpine AS build

ARG VITE_INSTALLER_APP_URL
ENV VITE_INSTALLER_APP_URL=${VITE_INSTALLER_APP_URL}

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

ENV BACKEND_URL=http://localhost:8080
ENTRYPOINT ["/docker-entrypoint.sh"]
