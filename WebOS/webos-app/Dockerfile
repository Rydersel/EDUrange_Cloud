# docker buildx build --platform linux/amd64,linux/arm64 -t gcr.io/edurangectf/webos . --push


FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
