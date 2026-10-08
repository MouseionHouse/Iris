## Builder
FROM node:24.13.1-alpine AS builder

WORKDIR /src

COPY .npmrc package.json package-lock.json /src/
# The cache mount keeps npm's downloads on the build host between builds.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . /src/
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN npm run build


## Android: everything the Android project takes from Node, made from the same build and the same
## node_modules as the web image. CI exports it (`--target android --output type=local`) over a
## checkout, and Gradle then runs with no Node, npm ci or Capacitor CLI of its own.
FROM builder AS android-sync

RUN node scripts/mobile-bundle.js && npx cap sync android

FROM scratch AS android

# The mobile bundle and Capacitor's generated config, as `cap sync` lays them out.
COPY --from=android-sync /src/mobile/android/app/src/main/assets /mobile/android/app/src/main/assets
COPY --from=android-sync /src/mobile/android/capacitor-cordova-android-plugins /mobile/android/capacitor-cordova-android-plugins
COPY --from=android-sync /src/mobile/android/capacitor.settings.gradle /mobile/android/capacitor.settings.gradle
COPY --from=android-sync /src/mobile/android/app/capacitor.build.gradle /mobile/android/app/capacitor.build.gradle
# The Android libraries of Capacitor and its plugins, which capacitor.settings.gradle includes.
COPY --from=android-sync /src/node_modules/@capacitor /node_modules/@capacitor


## App
FROM nginx:1.31.5-alpine

COPY --from=builder /src/dist /app
COPY --from=builder /src/docker-nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html \
  && ln -s /app /usr/share/nginx/html
