FROM ghcr.io/puppeteer/puppeteer:latest

USER root

WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true

# La imagen oficial de Puppeteer trae Chrome instalado en el cache de pptruser.
# Creamos un enlace fijo para que whatsapp-web.js/Puppeteer lo encuentre siempre.
RUN CHROME_PATH="$(find /home/pptruser/.cache/puppeteer -type f -name chrome | head -n 1)" && \
    echo "Chrome encontrado en: $CHROME_PATH" && \
    test -n "$CHROME_PATH" && \
    ln -sf "$CHROME_PATH" /usr/bin/google-chrome-stable

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Limpia el entrypoint heredado de la imagen base.
ENTRYPOINT []

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

CMD ["node", "bot.js"]
