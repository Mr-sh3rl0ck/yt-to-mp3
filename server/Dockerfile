FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp nightly (latest YouTube compat fixes)
RUN pip3 install --break-system-packages yt-dlp[default] \
    && yt-dlp --update-to nightly

WORKDIR /app

# Install Node deps
COPY package.json ./
RUN npm install --omit=dev

# Copy app
COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
