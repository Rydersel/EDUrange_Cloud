# docker buildx build --platform linux/amd64,linux/arm64 -t registry.rydersel.cloud/webos . --push

FROM node:18.17.0

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000
EXPOSE 3002

CMD ["npm", "run", "start-serve"]
