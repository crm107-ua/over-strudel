# OMR service for Over Strudel: Audiveris (AGPL-3.0) behind a tiny HTTP server. PDF -> MusicXML.
FROM ubuntu:24.04

ARG AUDIVERIS_VERSION=5.11.0
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl nodejs unzip tesseract-ocr-eng fontconfig libfreetype6 libgtk-3-0t64 \
 && curl -fsSL -o /tmp/audiveris.deb "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb" \
 && dpkg-deb -x /tmp/audiveris.deb / \
 && rm -f /tmp/audiveris.deb \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata \
    JAVA_TOOL_OPTIONS="-Xmx2g -Djava.awt.headless=true" \
    HOME=/home/omr \
    PORT=8080

# non-root, no login
RUN useradd --system --uid 10001 --create-home --home-dir /home/omr --shell /usr/sbin/nologin omr
WORKDIR /srv
COPY server.mjs ./server.mjs
USER omr
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
