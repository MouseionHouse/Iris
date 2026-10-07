## Builder
FROM node:24.13.1-alpine AS builder

WORKDIR /src

COPY .npmrc package.json package-lock.json /src/
# The cache mount keeps npm's downloads on the build host between builds.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . /src/
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN npm run build


## App
FROM nginx:1.31.5-alpine

COPY --from=builder /src/dist /app
COPY --from=builder /src/docker-nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html \
  && ln -s /app /usr/share/nginx/html
