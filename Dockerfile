FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN npm run build

CMD ["npm", "start"]
