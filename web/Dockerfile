FROM node:22-alpine AS build

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache apache2-utils

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY monitor-entrypoint.sh /usr/local/bin/monitor-entrypoint.sh
RUN chmod +x /usr/local/bin/monitor-entrypoint.sh
COPY --from=build /src/dist /usr/share/nginx/html

ENTRYPOINT ["/usr/local/bin/monitor-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
