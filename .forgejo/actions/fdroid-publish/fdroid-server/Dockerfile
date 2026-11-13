# Custom fdroidserver image.
#
# Why we don't use registry.gitlab.com/fdroid/docker-executable-fdroidserver:
# That image bundles androguard 3.4.0a1 (Debian bookworm), which is from
# 2020 and crashes on modern Flutter-built APKs with:
#   ResParserError: res1 must be zero!
# The fix is androguard >= 4.1, which only exists on PyPI; Debian backports
# still pin 3.4.0a1. We pip-install latest fdroidserver here so we get a
# matching androguard automatically.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:/opt/android-sdk/platform-tools:/opt/android-sdk/build-tools/34.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        default-jdk-headless \
        git \
        python3 \
        python3-pip \
        python3-venv \
        unzip \
        wget \
        # Android build-tools needed by fdroid update for apksigner / zipalign / aapt:
        apksigner \
        zipalign \
        aapt \
    && rm -rf /var/lib/apt/lists/*

# Install fdroidserver from PyPI into a venv (Debian bookworm forbids
# system-wide pip installs since PEP 668). Pinned: publish.sh relies on how
# 2.4.5 uses its apk cache (`--rename-apks` forces a clean run there), so a
# newer release is an upgrade to check, not a rebuild to pick up.
RUN python3 -m venv /opt/fdroidserver-venv \
    && /opt/fdroidserver-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/fdroidserver-venv/bin/pip install --no-cache-dir fdroidserver==2.4.5

ENV PATH=/opt/fdroidserver-venv/bin:$PATH

# Run as the host user (passed via `docker run --user $(id -u):$(id -g)`)
# so written files end up owned by the host user.
WORKDIR /repo
ENTRYPOINT ["/opt/fdroidserver-venv/bin/fdroid"]
CMD ["--help"]
