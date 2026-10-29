# Mantis with Chromium, ffmpeg and fonts, so `look` and `proof --video` run without installing anything.
#
#   docker run --rm --network host -v "$PWD:/work" ghcr.io/vulinh1704/mantis look http://localhost:3000
#
# Output lands in ./.mantis of the mounted directory. See "Docker" in the README.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /opt/mantis
COPY package.json package-lock.json ./
# Only Chromium's headless shell: Mantis never opens a headed browser. Inter and DejaVu Sans Mono are
# the fonts the sheets ask for first, so they look the same as on a desktop.
RUN npm ci --omit=dev \
 && npx playwright install --with-deps --only-shell chromium \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-inter fonts-dejavu-core git \
 && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

COPY bin ./bin
COPY src ./src
COPY skills ./skills
COPY assets/mantis-128.png ./assets/
RUN chmod 755 bin/mantis.js \
 && ln -s /opt/mantis/bin/mantis.js /usr/local/bin/mantis \
 && git config --system --add safe.directory '*'

LABEL org.opencontainers.image.title="mantis" \
      org.opencontainers.image.description="Eyes for your coding agent: find layout, contrast, dark-mode and i18n bugs in a real browser, and catch fixes that only hide them." \
      org.opencontainers.image.source="https://github.com/vulinh1704/mantis" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /work
ENTRYPOINT ["mantis"]
CMD ["--help"]
