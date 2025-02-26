# docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/webos . --push

FROM node:18.18.1

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
