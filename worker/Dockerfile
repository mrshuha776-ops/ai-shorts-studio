FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server.mjs ./
RUN mkdir -p /data/jobs

ENV PORT=8080
ENV JOB_DIR=/data/jobs
EXPOSE 8080
CMD ["npm", "start"]
